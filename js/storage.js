const STORAGE_KEY = "personalWorkspaceCacheV1";
const COLLECTIONS = ["plans", "diaryEntries", "wishlistItems"];
const KINDS = {
    calendar: "calendar-event-v1",
    daily: "daily-plan-v1",
    journal: "journal-entry-v1",
    wish: "wish-item-v1"
};

const ALLOWED_KINDS = {
    plans: new Set([KINDS.calendar, KINDS.daily]),
    diaryEntries: new Set([KINDS.journal]),
    wishlistItems: new Set([KINDS.wish])
};

let syncDiffHandler = null;

function emptyData() {
    return {
        version: 1,
        plans: [],
        diaryEntries: [],
        wishlistItems: []
    };
}

function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cleanCollection(name, value) {
    if (!Array.isArray(value)) return [];
    return value.filter((item) => isRecord(item)
        && typeof item.id === "string"
        && item.id.length > 0
        && item.id.length <= 1000
        && ALLOWED_KINDS[name]?.has(item.kind));
}

export function normalizeData(value) {
    const clean = emptyData();
    if (!isRecord(value)) return clean;
    COLLECTIONS.forEach((name) => {
        clean[name] = cleanCollection(name, value[name]);
    });
    return clean;
}

export function loadData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? normalizeData(JSON.parse(raw)) : emptyData();
    } catch (error) {
        console.warn("本地数据读取失败。", error);
        return emptyData();
    }
}

function saveLocalData(data) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeData(data)));
        return true;
    } catch (error) {
        console.error("本地数据保存失败。", error);
        return false;
    }
}

export function configureCloudStorage({ syncDiff }) {
    syncDiffHandler = typeof syncDiff === "function" ? syncDiff : null;
}

export function applyCloudCollection(name, items) {
    if (!COLLECTIONS.includes(name)) return;
    const data = loadData();
    data[name] = cleanCollection(name, items).map((item) => {
        const { cloudUpdatedAt, ...record } = item;
        return record;
    });
    saveLocalData(data);
    window.dispatchEvent(new CustomEvent("personal-workspace-cloud-data", {
        detail: { collection: name }
    }));
}

export function updateData(change) {
    const before = loadData();
    const draft = structuredClone(before);
    const changed = change(draft) || draft;
    const after = normalizeData(changed);
    if (!saveLocalData(after)) throw new Error("STORAGE_WRITE_FAILED");
    if (syncDiffHandler) {
        Promise.resolve(syncDiffHandler(before, after)).catch(() => {});
    }
    return after;
}

export function generateId() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

export function safeText(value, maxLength = 5000, fallback = "") {
    if (typeof value !== "string") return fallback;
    return value.trim().slice(0, maxLength);
}

export function isIsoDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function localToday() {
    const now = new Date();
    return isoFromDate(now);
}

export function isoFromDate(date) {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");
}

export function dateFromIso(value) {
    if (!isIsoDate(value)) return new Date(NaN);
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
}

export function formatChineseDate(value, options = {}) {
    const date = dateFromIso(value);
    if (Number.isNaN(date.getTime())) return "日期无效";
    return date.toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
        ...options
    });
}

export function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

export { STORAGE_KEY, COLLECTIONS, KINDS };
