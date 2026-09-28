import { KINDS, escapeHtml, generateId, loadData, safeText, updateData } from "./storage.js";

function wishes() {
    return loadData().wishlistItems
        .filter((item) => item.kind === KINDS.wish)
        .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
}

function formMarkup(item = null) {
    return `
        <form id="wish-form" class="dialog-form">
            <div class="dialog-heading"><div><p class="eyebrow">愿望清单</p><h2>${item ? "编辑愿望" : "添加愿望"}</h2></div><button type="button" class="dialog-x" data-close-wish aria-label="关闭">×</button></div>
            <label class="field"><span>Emoji</span><input name="emoji" maxlength="16" value="${escapeHtml(item?.emoji || "✨")}" required></label>
            <label class="field"><span>中文标题</span><input name="title" maxlength="200" value="${escapeHtml(item?.title || "")}" placeholder="以后想做什么？" required></label>
            <label class="field"><span>详细计划</span><textarea name="details" rows="6" maxlength="5000" placeholder="写下想法、准备事项或实现方式">${escapeHtml(item?.details || "")}</textarea></label>
            <p class="form-error" aria-live="polite"></p>
            <div class="action-row"><button class="primary-button" type="submit">保存愿望</button><button class="secondary-button" type="button" data-close-wish>取消</button></div>
        </form>`;
}

function openForm(container, context, rerender, item = null) {
    const dialog = container.querySelector("#wish-dialog");
    dialog.innerHTML = formMarkup(item);
    dialog.querySelectorAll("[data-close-wish]").forEach((button) => button.addEventListener("click", () => dialog.close()));
    dialog.querySelector("#wish-form").addEventListener("submit", (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        if (!form.reportValidity()) return;
        const fields = new FormData(form);
        const emoji = safeText(fields.get("emoji"), 16, "✨");
        const title = safeText(fields.get("title"), 200);
        const details = safeText(fields.get("details"), 5000);
        if (!emoji || !title) {
            form.querySelector(".form-error").textContent = "请填写Emoji和标题。";
            return;
        }
        const next = {
            kind: KINDS.wish,
            id: item?.id || generateId(),
            emoji,
            title,
            details,
            createdAt: item?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        updateData((data) => {
            const index = data.wishlistItems.findIndex((entry) => entry.id === next.id);
            if (index >= 0) data.wishlistItems[index] = next;
            else data.wishlistItems.push(next);
            return data;
        });
        dialog.close();
        context.toast(item ? "愿望已更新。" : "愿望已添加。");
        rerender();
    });
    dialog.showModal();
}

export function renderWishlist(container, context) {
    const items = wishes();
    const rerender = () => renderWishlist(container, context);
    const cards = items.length ? items.map((item) => `
        <article class="wish-card">
            <span class="wish-emoji">${escapeHtml(item.emoji)}</span>
            <div class="wish-content"><h3>${escapeHtml(item.title)}</h3>${item.details ? `<p>${escapeHtml(item.details).replace(/\n/g, "<br>")}</p>` : '<p class="muted">还没有详细计划。</p>'}</div>
            <div class="card-actions"><button class="text-button" type="button" data-edit-wish="${escapeHtml(item.id)}">编辑</button><button class="text-button danger-text" type="button" data-delete-wish="${escapeHtml(item.id)}">删除</button></div>
        </article>`).join("") : '<div class="empty-state"><span>✨</span><p>愿望清单还是空的，从第一个愿望开始吧。</p></div>';
    container.innerHTML = `
        <header class="page-header"><div><p class="eyebrow">愿望清单</p><h1>以后想做的事情</h1><p class="muted">用一个Emoji、标题和详细计划保存灵感。</p></div><button id="add-wish" class="primary-button" type="button">＋ 添加愿望</button></header>
        <section class="wish-list">${cards}</section>
        <dialog id="wish-dialog" class="app-dialog"></dialog>`;

    container.querySelector("#add-wish").addEventListener("click", () => openForm(container, context, rerender));
    container.querySelectorAll("[data-edit-wish]").forEach((button) => button.addEventListener("click", () => {
        const item = items.find((entry) => entry.id === button.dataset.editWish);
        if (item) openForm(container, context, rerender, item);
    }));
    container.querySelectorAll("[data-delete-wish]").forEach((button) => button.addEventListener("click", () => {
        if (!window.confirm("确定删除这个愿望吗？")) return;
        updateData((data) => {
            data.wishlistItems = data.wishlistItems.filter((item) => item.id !== button.dataset.deleteWish);
            return data;
        });
        context.toast("愿望已删除。");
        rerender();
    }));
}
