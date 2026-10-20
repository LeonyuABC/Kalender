import { KINDS, escapeHtml, generateId, isIsoDate, loadData, localToday, safeText, updateData } from "./storage.js";

const PLAN_EMOJIS = [
    "😊", "😄", "😐", "😔", "😢", "❤️", "😴", "🥰", "😡", "🤧",
    "🎬", "🌟", "🍻", "🎉", "🏠", "💻", "📚", "🚌", "🚄", "✈️"
];

let wishTimer = null;

function wishes() {
    return loadData().wishlistItems
        .filter((item) => item.kind === KINDS.wish)
        .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
}

function elapsedLabel(value) {
    const startedAt = new Date(value).getTime();
    if (!Number.isFinite(startedAt)) return "刚刚添加";
    const totalMinutes = Math.max(0, Math.floor((Date.now() - startedAt) / 60000));
    if (totalMinutes < 60) return `${Math.max(1, totalMinutes)}分钟`;
    const totalHours = Math.floor(totalMinutes / 60);
    if (totalHours < 24) {
        const minutes = totalMinutes % 60;
        return `${totalHours}小时${minutes ? `${minutes}分钟` : ""}`;
    }
    const totalDays = Math.floor(totalHours / 24);
    if (totalDays < 365) {
        const hours = totalHours % 24;
        return `${totalDays}天${hours ? `${hours}小时` : ""}`;
    }
    const years = Math.floor(totalDays / 365);
    const days = totalDays % 365;
    return `${years}年${days ? `${days}天` : ""}`;
}

function refreshWishTimers(container) {
    container.querySelectorAll("[data-wish-created]").forEach((element) => {
        element.textContent = `已存在 ${elapsedLabel(element.dataset.wishCreated)}`;
    });
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

function emojiRadio(emoji, selected) {
    return `<label class="emoji-choice" title="${emoji}"><input type="radio" name="emoji" value="${emoji}" ${emoji === selected ? "checked" : ""}><span>${emoji}</span></label>`;
}

function planFormMarkup(item) {
    const selectedEmoji = PLAN_EMOJIS.includes(item.emoji) ? item.emoji : "🌟";
    return `
        <form id="wish-plan-form" class="dialog-form">
            <div class="dialog-heading"><div><p class="eyebrow">愿望计划</p><h2>加入个人日程</h2></div><button type="button" class="dialog-x" data-close-plan aria-label="关闭">×</button></div>
            <div class="field event-kind-field"><span>事项</span>
                <div class="event-color-picker" role="radiogroup" aria-label="事项颜色">
                    <label class="event-color-choice blue" title="个人"><input type="radio" name="category" value="personal" checked><span aria-hidden="true"></span></label>
                    <label class="event-color-choice green" title="活动"><input type="radio" name="category" value="activity"><span aria-hidden="true"></span></label>
                </div>
                <div class="emoji-grid event-emoji-grid">${PLAN_EMOJIS.map((emoji) => emojiRadio(emoji, selectedEmoji)).join("")}</div>
            </div>
            <label class="field"><span>日期</span><input name="date" type="date" value="${localToday()}" required></label>
            <label class="field"><span>标题</span><input name="title" maxlength="200" value="${escapeHtml(item.title)}" required></label>
            <label class="field"><span>内容</span><textarea name="details" rows="4" maxlength="5000">${escapeHtml(item.details || "")}</textarea></label>
            <p class="form-error" aria-live="polite"></p>
            <div class="action-row"><button class="primary-button" type="submit">保存计划</button><button class="secondary-button" type="button" data-close-plan>取消</button></div>
        </form>`;
}

function realizeMarkup(item) {
    return `
        <form id="wish-realize-form" class="dialog-form compact-dialog-form">
            <div class="dialog-heading"><div><p class="eyebrow">实现愿望</p><h2>${escapeHtml(item.emoji)} ${escapeHtml(item.title)}</h2></div><button type="button" class="dialog-x" data-close-realize aria-label="关闭">×</button></div>
            <p class="confirm-copy">确定这个愿望已经实现了吗？</p>
            <div class="action-row"><button class="primary-button success-button" type="submit">确定</button><button class="secondary-button" type="button" data-close-realize>取消</button></div>
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

function openPlanForm(container, context, item) {
    const dialog = container.querySelector("#wish-plan-dialog");
    dialog.innerHTML = planFormMarkup(item);
    dialog.querySelectorAll("[data-close-plan]").forEach((button) => button.addEventListener("click", () => dialog.close()));
    dialog.querySelector("#wish-plan-form").addEventListener("submit", (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        if (!form.reportValidity()) return;
        const fields = new FormData(form);
        const date = safeText(fields.get("date"), 10);
        const title = safeText(fields.get("title"), 200);
        if (!isIsoDate(date) || !title) {
            form.querySelector(".form-error").textContent = "请填写标题和正确的日期。";
            return;
        }
        const now = new Date().toISOString();
        updateData((data) => {
            data.plans.push({
                kind: KINDS.calendar,
                id: generateId(),
                category: fields.get("category") === "activity" ? "activity" : "personal",
                emoji: PLAN_EMOJIS.includes(fields.get("emoji")) ? fields.get("emoji") : "🌟",
                title,
                details: safeText(fields.get("details"), 5000),
                date,
                endDate: date,
                sourceWishId: item.id,
                createdAt: now,
                updatedAt: now
            });
            return data;
        });
        dialog.close();
        context.toast("已加入个人日程");
    });
    dialog.showModal();
}

function openRealizeDialog(container, context, rerender, item) {
    const dialog = container.querySelector("#wish-realize-dialog");
    dialog.innerHTML = realizeMarkup(item);
    dialog.querySelectorAll("[data-close-realize]").forEach((button) => button.addEventListener("click", () => dialog.close()));
    dialog.querySelector("#wish-realize-form").addEventListener("submit", (event) => {
        event.preventDefault();
        updateData((data) => {
            data.wishlistItems = data.wishlistItems.filter((entry) => entry.id !== item.id);
            return data;
        });
        dialog.close();
        context.toast("恭喜实现愿望");
        rerender();
    });
    dialog.showModal();
}

export function renderWishlist(container, context) {
    window.clearInterval(wishTimer);
    const items = wishes();
    const rerender = () => renderWishlist(container, context);
    const cards = items.length ? items.map((item) => {
        const createdAt = item.createdAt || item.updatedAt || new Date().toISOString();
        return `
        <article class="wish-card">
            <span class="wish-emoji">${escapeHtml(item.emoji)}</span>
            <div class="wish-content">
                <div class="wish-title-line"><h3>${escapeHtml(item.title)}</h3><span class="wish-age" data-wish-created="${escapeHtml(createdAt)}">已存在 ${elapsedLabel(createdAt)}</span></div>
                ${item.details ? `<p>${escapeHtml(item.details).replace(/\n/g, "<br>")}</p>` : ""}
            </div>
            <div class="card-actions wish-actions">
                <button class="secondary-button small-action" type="button" data-plan-wish="${escapeHtml(item.id)}">计划</button>
                <button class="primary-button small-action success-button" type="button" data-realize-wish="${escapeHtml(item.id)}">实现</button>
            </div>
        </article>`;
    }).join("") : '<div class="empty-state"><span>✨</span><p>愿望清单还是空的，从第一个愿望开始吧。</p></div>';
    container.innerHTML = `
        <header class="page-header"><div><p class="eyebrow">愿望清单</p><h1>以后想做的事情</h1><p class="muted">每个愿望都会记录陪伴你的时间。</p></div><button id="add-wish" class="primary-button" type="button">＋ 添加愿望</button></header>
        <section class="wish-list">${cards}</section>
        <dialog id="wish-dialog" class="app-dialog"></dialog>
        <dialog id="wish-plan-dialog" class="app-dialog"></dialog>
        <dialog id="wish-realize-dialog" class="app-dialog confirm-dialog"></dialog>`;

    refreshWishTimers(container);
    wishTimer = window.setInterval(() => {
        if (!container.isConnected || !container.querySelector("[data-wish-created]")) {
            window.clearInterval(wishTimer);
            return;
        }
        refreshWishTimers(container);
    }, 60000);

    container.querySelector("#add-wish").addEventListener("click", () => openForm(container, context, rerender));
    container.querySelectorAll("[data-plan-wish]").forEach((button) => button.addEventListener("click", () => {
        const item = items.find((entry) => entry.id === button.dataset.planWish);
        if (item) openPlanForm(container, context, item);
    }));
    container.querySelectorAll("[data-realize-wish]").forEach((button) => button.addEventListener("click", () => {
        const item = items.find((entry) => entry.id === button.dataset.realizeWish);
        if (item) openRealizeDialog(container, context, rerender, item);
    }));
}
