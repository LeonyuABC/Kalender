import { applyCloudCollection, configureCloudStorage } from "./storage.js";
import { initializeCloud, purgeLegacyCloudData, startRealtimeSync, syncDataDiff } from "./cloud.js";
import { renderHome } from "./home.js";
import { renderWishlist } from "./wishlist.js";
import { renderRecipes } from "./recipes.js";

const main = document.querySelector("#main-content");
const toastElement = document.querySelector("#toast");
const syncStatus = document.querySelector("#sync-status");
const validRoutes = new Set(["home", "wishlist", "recipes"]);
let toastTimer = null;
let cloudRenderTimer = null;

function currentRoute() {
    const route = window.location.hash.replace(/^#/, "");
    return validRoutes.has(route) ? route : "home";
}

function toast(message) {
    window.clearTimeout(toastTimer);
    toastElement.textContent = message;
    toastElement.classList.add("visible");
    toastTimer = window.setTimeout(() => toastElement.classList.remove("visible"), 2600);
}

function setActiveNavigation(route) {
    document.querySelectorAll("[data-route]").forEach((button) => {
        const active = button.dataset.route === route;
        button.classList.toggle("active", active);
        if (active) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
    });
}

function navigate(route) {
    const next = validRoutes.has(route) ? route : "home";
    if (window.location.hash === `#${next}`) renderRoute(next);
    else window.location.hash = next;
}

const context = { toast, navigate };

function renderRoute(route = currentRoute()) {
    setActiveNavigation(route);
    if (route === "home") renderHome(main, context);
    if (route === "wishlist") renderWishlist(main, context);
    if (route === "recipes") renderRecipes(main, context);
    const titles = {
        home: "个人日程",
        wishlist: "愿望清单 · 个人日程",
        recipes: "我的菜谱 · 个人日程"
    };
    document.title = titles[route] || titles.home;
    main.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
}

document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-route]");
    if (!button) return;
    event.preventDefault();
    navigate(button.dataset.route);
});

window.addEventListener("hashchange", () => renderRoute());
window.addEventListener("personal-workspace-sync-status", (event) => {
    const { status, message } = event.detail || {};
    const labels = {
        connecting: "正在连接",
        connected: "已同步",
        saving: "正在保存",
        error: message || "本地模式"
    };
    syncStatus.dataset.status = status || "connecting";
    syncStatus.textContent = labels[status] || labels.connecting;
});

window.addEventListener("personal-workspace-cloud-data", () => {
    window.clearTimeout(cloudRenderTimer);
    cloudRenderTimer = window.setTimeout(() => {
        if (main.querySelector("dialog[open], form:focus-within, textarea:focus")) return;
        renderRoute();
    }, 150);
});

configureCloudStorage({ syncDiff: syncDataDiff });
try {
    localStorage.removeItem(atob("Y291cGxlU3BhY2VDbG91ZENhY2hlVjE="));
} catch (error) {
    console.warn("旧本地缓存清理失败。", error);
}
renderRoute();

initializeCloud()
    .then(async () => {
        await purgeLegacyCloudData();
        startRealtimeSync((name, items) => applyCloudCollection(name, items));
    })
    .catch((error) => {
        console.error("Firebase初始化失败。", error);
        syncStatus.dataset.status = "error";
        syncStatus.textContent = "本地模式";
        toast("云同步暂时不可用，内容仍会保存在当前设备。 ");
    });

if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./service-worker.js", { scope: "./" })
            .catch((error) => console.warn("应用缓存注册失败。", error));
    });
}
