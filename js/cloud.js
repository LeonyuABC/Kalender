import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
    browserLocalPersistence,
    getAuth,
    setPersistence,
    signInAnonymously
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
    collection,
    deleteDoc,
    doc,
    getDocs,
    getFirestore,
    onSnapshot,
    serverTimestamp,
    setDoc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { CONFIG } from "../config.js";
import { COLLECTIONS } from "./storage.js";

const LEGACY_COLLECTIONS = ["invitations", "moods", "notifications"];
const ACCEPTED_KINDS = {
    plans: new Set(["calendar-event-v1", "daily-plan-v1"]),
    diaryEntries: new Set(["journal-entry-v1"]),
    wishlistItems: new Set(["wish-item-v1"])
};

let app = null;
let auth = null;
let db = null;
let signInPromise = null;
let unsubscribers = [];

function configured() {
    return Object.values(CONFIG.firebase || {}).every((value) => typeof value === "string" && value.trim());
}

function workspaceId() {
    try {
        return atob(CONFIG.workspaceKey);
    } catch (error) {
        throw new Error("INVALID_WORKSPACE_KEY");
    }
}

function dispatchStatus(status, message = "") {
    window.dispatchEvent(new CustomEvent("personal-workspace-sync-status", {
        detail: { status, message }
    }));
}

export async function initializeCloud() {
    if (!configured()) throw new Error("FIREBASE_NOT_CONFIGURED");
    if (!app) {
        app = initializeApp(CONFIG.firebase);
        auth = getAuth(app);
        db = getFirestore(app);
        await setPersistence(auth, browserLocalPersistence);
    }
    if (typeof auth.authStateReady === "function") await auth.authStateReady();
    if (!auth.currentUser) {
        signInPromise ||= signInAnonymously(auth).finally(() => { signInPromise = null; });
        await signInPromise;
    }
}

function cloudCollection(name) {
    return collection(db, "couples", workspaceId(), name);
}

export function startRealtimeSync(onCollectionChanged) {
    if (!db || !auth?.currentUser) throw new Error("NOT_AUTHENTICATED");
    stopRealtimeSync();
    dispatchStatus("connecting");
    const ready = new Set();
    unsubscribers = COLLECTIONS.map((name) => onSnapshot(
        cloudCollection(name),
        (snapshot) => {
            onCollectionChanged(name, snapshot.docs.map((item) => item.data()));
            ready.add(name);
            if (ready.size === COLLECTIONS.length) dispatchStatus("connected");
        },
        (error) => {
            console.error(`Firebase同步失败：${name}`, error);
            dispatchStatus("error", "云同步失败，正在使用本地数据");
        }
    ));
}

// 新版第一次运行时清理旧情侣空间留下的云端文档。只保留本版明确
// 识别的数据类型，因此不会在以后误删新日程、计划、日记或愿望。
export async function purgeLegacyCloudData() {
    if (!db || !auth?.currentUser) throw new Error("NOT_AUTHENTICATED");
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - 30);
    const dailyPlanCutoff = [
        cutoff.getFullYear(),
        String(cutoff.getMonth() + 1).padStart(2, "0"),
        String(cutoff.getDate()).padStart(2, "0")
    ].join("-");
    const names = [...COLLECTIONS, ...LEGACY_COLLECTIONS];
    for (const name of names) {
        const snapshot = await getDocs(cloudCollection(name));
        const obsolete = snapshot.docs.filter((item) => {
            if (LEGACY_COLLECTIONS.includes(name)) return true;
            const data = item.data();
            if (!ACCEPTED_KINDS[name]?.has(data?.kind)) return true;
            return name === "plans" && data.kind === "daily-plan-v1"
                && (typeof data.date !== "string" || data.date < dailyPlanCutoff);
        });
        for (let index = 0; index < obsolete.length; index += 50) {
            await Promise.all(obsolete.slice(index, index + 50).map((item) => deleteDoc(item.ref)));
        }
    }
}

export function stopRealtimeSync() {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    unsubscribers = [];
}

function recordReference(collectionName, id) {
    return doc(db, "couples", workspaceId(), collectionName, encodeURIComponent(String(id)).slice(0, 1400));
}

function cleanForCloud(value) {
    const clean = structuredClone(value);
    delete clean.cloudUpdatedAt;
    return clean;
}

function same(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function byId(items) {
    return new Map((items || []).map((item) => [item.id, item]));
}

async function syncCollection(name, beforeItems, afterItems) {
    const before = byId(beforeItems);
    const after = byId(afterItems);
    const operations = [];

    for (const [id, oldItem] of before) {
        if (!after.has(id)) {
            operations.push(deleteDoc(recordReference(name, id)));
        } else if (!same(oldItem, after.get(id))) {
            const next = cleanForCloud(after.get(id));
            const reference = recordReference(name, id);
            operations.push(updateDoc(reference, {
                ...next,
                cloudUpdatedAt: serverTimestamp()
            }).catch(() => setDoc(reference, {
                ...next,
                cloudUpdatedAt: serverTimestamp()
            })));
        }
    }

    for (const [id, item] of after) {
        if (!before.has(id)) {
            operations.push(setDoc(recordReference(name, id), {
                ...cleanForCloud(item),
                cloudUpdatedAt: serverTimestamp()
            }));
        }
    }
    await Promise.all(operations);
}

export async function syncDataDiff(before, after) {
    if (!db || !auth?.currentUser) return;
    dispatchStatus("saving");
    try {
        for (const name of COLLECTIONS) {
            if (!same(before[name], after[name])) {
                await syncCollection(name, before[name], after[name]);
            }
        }
        dispatchStatus("connected");
    } catch (error) {
        dispatchStatus("error", "更改已保存在本机，云同步暂时失败");
        throw error;
    }
}
