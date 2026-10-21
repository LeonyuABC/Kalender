import { MEAT_CATEGORIES, meatCategory } from "./constants.js";
import { KINDS, RECORD_TYPES, escapeHtml, generateId, loadData, localToday, safeText, updateData } from "./storage.js";

function recipes() {
    return loadData().wishlistItems
        .filter((item) => item.kind === KINDS.wish && item.recordType === RECORD_TYPES.recipe)
        .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
}

function formMarkup(item = null) {
    const photo = typeof item?.photoData === "string" && item.photoData.startsWith("data:image/") ? item.photoData : "";
    const selectedCategory = meatCategory(item?.meatCategory).id;
    const categoryChoices = MEAT_CATEGORIES.map((category) => `
        <label class="meat-category-choice ${category.color}">
            <input type="radio" name="meatCategory" value="${category.id}" ${selectedCategory === category.id ? "checked" : ""}>
            <span><i aria-hidden="true"></i>${category.label}</span>
        </label>`).join("");
    return `
        <form id="recipe-form" class="dialog-form">
            <div class="dialog-heading"><div><p class="eyebrow">我的菜谱</p><h2>${item ? "编辑菜谱" : "添加菜谱"}</h2></div><button type="button" class="dialog-x" data-close-recipe aria-label="关闭">×</button></div>
            <label class="field"><span>菜名</span><input name="title" maxlength="200" value="${escapeHtml(item?.title || "")}" required></label>
            <div class="field"><span>肉类</span><div class="meat-category-picker">${categoryChoices}</div></div>
            <label class="field"><span>做法与备注</span><textarea name="details" rows="7" maxlength="8000">${escapeHtml(item?.details || "")}</textarea></label>
            <label class="field recipe-photo-field"><span>照片（可选，自动压缩）</span><input name="photo" type="file" accept="image/*"></label>
            ${photo ? `<div class="recipe-edit-photo"><img src="${escapeHtml(photo)}" alt="当前菜品照片"><label><input name="removePhoto" type="checkbox"> 删除当前照片</label></div>` : ""}
            <p class="form-error" aria-live="polite"></p>
            <div class="action-row"><button class="primary-button" type="submit">保存菜谱</button><button class="secondary-button" type="button" data-close-recipe>取消</button></div>
        </form>`;
}

function detailMarkup(item) {
    const photo = typeof item.photoData === "string" && item.photoData.startsWith("data:image/") ? item.photoData : "";
    const category = meatCategory(item.meatCategory);
    return `
        <article class="recipe-detail">
            <div class="dialog-heading"><div><p class="eyebrow">菜谱详情</p><h2>${escapeHtml(item.title)}</h2><span class="meat-category-badge ${category.color}"><i aria-hidden="true"></i>${category.label}</span></div><button type="button" class="dialog-x" data-close-detail aria-label="关闭">×</button></div>
            ${photo ? `<img class="recipe-detail-image" src="${escapeHtml(photo)}" alt="${escapeHtml(item.title)}">` : '<div class="recipe-detail-placeholder" aria-hidden="true">🍽️</div>'}
            <div class="recipe-method"><h3>做法与备注</h3><p>${item.details ? escapeHtml(item.details).replace(/\n/g, "<br>") : "暂时没有备注。"}</p></div>
        </article>`;
}

function readImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("IMAGE_READ_FAILED"));
        reader.readAsDataURL(file);
    });
}

function loadBrowserImage(source) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("IMAGE_DECODE_FAILED"));
        image.src = source;
    });
}

async function compressRecipePhoto(file) {
    if (!file.type.startsWith("image/")) throw new Error("NOT_IMAGE");
    if (file.size > 12 * 1024 * 1024) throw new Error("IMAGE_TOO_LARGE");
    const source = await readImage(file);
    const image = await loadBrowserImage(source);
    const maxSide = 720;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let quality = 0.72;
    let result = canvas.toDataURL("image/jpeg", quality);
    while (result.length > 180000 && quality > 0.38) {
        quality -= 0.08;
        result = canvas.toDataURL("image/jpeg", quality);
    }
    if (result.length > 240000) throw new Error("COMPRESSED_IMAGE_TOO_LARGE");
    return result;
}

function openForm(container, context, rerender, item = null) {
    const dialog = container.querySelector("#recipe-dialog");
    dialog.innerHTML = formMarkup(item);
    dialog.querySelectorAll("[data-close-recipe]").forEach((button) => button.addEventListener("click", () => dialog.close()));
    dialog.querySelector("#recipe-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        if (!form.reportValidity()) return;
        const button = form.querySelector('[type="submit"]');
        const error = form.querySelector(".form-error");
        button.disabled = true;
        button.textContent = "正在保存……";
        error.textContent = "";
        try {
            const fields = new FormData(form);
            const title = safeText(fields.get("title"), 200);
            const details = safeText(fields.get("details"), 8000);
            const category = meatCategory(safeText(fields.get("meatCategory"), 20));
            const file = form.elements.photo.files?.[0];
            let photoData = item?.photoData || "";
            if (form.elements.removePhoto?.checked) photoData = "";
            if (file) photoData = await compressRecipePhoto(file);
            const now = new Date().toISOString();
            const next = {
                kind: KINDS.wish,
                recordType: RECORD_TYPES.recipe,
                id: item?.id || generateId(),
                title,
                details,
                meatCategory: category.id,
                photoData,
                createdAt: item?.createdAt || now,
                updatedAt: now
            };
            updateData((data) => {
                const index = data.wishlistItems.findIndex((entry) => entry.id === next.id);
                if (index >= 0) data.wishlistItems[index] = next;
                else data.wishlistItems.push(next);
                data.plans.forEach((entry) => {
                    if (entry.recordType !== RECORD_TYPES.meal || entry.recipeId !== next.id) return;
                    entry.title = next.title;
                    entry.meatCategory = next.meatCategory;
                    entry.updatedAt = now;
                });
                return data;
            });
            dialog.close();
            context.toast(item ? "菜谱已更新" : "菜谱已添加");
            rerender();
        } catch (problem) {
            console.error("菜谱照片处理失败。", problem);
            error.textContent = problem.message === "IMAGE_TOO_LARGE"
                ? "原图不能超过12MB。"
                : "照片处理失败，请换一张较小的JPG或PNG图片。";
        } finally {
            button.disabled = false;
            button.textContent = "保存菜谱";
        }
    });
    dialog.showModal();
}

function openDetail(container, item) {
    const dialog = container.querySelector("#recipe-detail-dialog");
    dialog.innerHTML = detailMarkup(item);
    dialog.querySelector("[data-close-detail]").addEventListener("click", () => dialog.close());
    dialog.showModal();
}

export function renderRecipes(container, context) {
    const items = recipes();
    const rerender = () => renderRecipes(container, context);
    const cards = items.length ? items.map((item) => {
        const photo = typeof item.photoData === "string" && item.photoData.startsWith("data:image/") ? item.photoData : "";
        const category = meatCategory(item.meatCategory);
        return `
            <article class="recipe-card">
                <button class="recipe-quick-add" type="button" data-add-today="${escapeHtml(item.id)}" aria-label="把${escapeHtml(item.title)}加入今天" title="加入今天">＋</button>
                <button class="recipe-card-photo" type="button" data-view-recipe="${escapeHtml(item.id)}" aria-label="查看${escapeHtml(item.title)}">
                    ${photo ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(item.title)}">` : '<span aria-hidden="true">🍽️</span>'}
                </button>
                <div class="recipe-card-body">
                    <div class="recipe-card-title"><h3>${escapeHtml(item.title)}</h3><span class="meat-category-badge ${category.color}"><i aria-hidden="true"></i>${category.label}</span></div>
                    <p>${item.details ? escapeHtml(item.details) : "暂时没有做法备注。"}</p>
                    <div class="card-actions">
                        <button class="text-button" type="button" data-view-recipe="${escapeHtml(item.id)}">查看</button>
                        <button class="text-button" type="button" data-edit-recipe="${escapeHtml(item.id)}">编辑</button>
                        <button class="text-button danger-text" type="button" data-delete-recipe="${escapeHtml(item.id)}">删除</button>
                    </div>
                </div>
            </article>`;
    }).join("") : '<div class="empty-state"><span>🍽️</span><p>还没有菜谱，把第一道会做的菜记下来吧。</p></div>';
    container.innerHTML = `
        <header class="page-header"><div><p class="eyebrow">我的菜谱</p><h1>今天想吃什么</h1><p class="muted">记录菜名、做法和照片，再把它安排到某一天。</p></div><button id="add-recipe" class="primary-button" type="button">＋ 添加菜谱</button></header>
        <section class="recipe-list">${cards}</section>
        <dialog id="recipe-dialog" class="app-dialog"></dialog>
        <dialog id="recipe-detail-dialog" class="app-dialog recipe-detail-dialog"></dialog>`;

    container.querySelector("#add-recipe").addEventListener("click", () => openForm(container, context, rerender));
    container.querySelectorAll("[data-add-today]").forEach((button) => button.addEventListener("click", () => {
        const item = items.find((entry) => entry.id === button.dataset.addToday);
        if (!item) return;
        const date = localToday();
        const occupied = new Set(loadData().plans
            .filter((entry) => entry.kind === KINDS.daily && entry.recordType === RECORD_TYPES.meal && entry.date === date)
            .map((entry) => Number(entry.slot)));
        const slot = [0, 1, 2, 3].find((value) => !occupied.has(value));
        if (slot === undefined) {
            context.toast("今天的菜品已经添加满了");
            return;
        }
        const category = meatCategory(item.meatCategory);
        const now = new Date().toISOString();
        updateData((data) => {
            data.plans.push({
                kind: KINDS.daily,
                recordType: RECORD_TYPES.meal,
                id: generateId(),
                recipeId: item.id,
                title: safeText(item.title, 200),
                meatCategory: category.id,
                date,
                slot,
                createdAt: now,
                updatedAt: now
            });
            return data;
        });
        context.toast(`已加入今天 · 第${slot + 1}格`);
    }));
    container.querySelectorAll("[data-view-recipe]").forEach((button) => button.addEventListener("click", () => {
        const item = items.find((entry) => entry.id === button.dataset.viewRecipe);
        if (item) openDetail(container, item);
    }));
    container.querySelectorAll("[data-edit-recipe]").forEach((button) => button.addEventListener("click", () => {
        const item = items.find((entry) => entry.id === button.dataset.editRecipe);
        if (item) openForm(container, context, rerender, item);
    }));
    container.querySelectorAll("[data-delete-recipe]").forEach((button) => button.addEventListener("click", () => {
        if (!window.confirm("确定删除这道菜谱吗？已经安排的对应菜品也会移除。")) return;
        updateData((data) => {
            data.wishlistItems = data.wishlistItems.filter((entry) => entry.id !== button.dataset.deleteRecipe);
            data.plans = data.plans.filter((entry) => entry.recordType !== RECORD_TYPES.meal || entry.recipeId !== button.dataset.deleteRecipe);
            return data;
        });
        context.toast("菜谱已删除");
        rerender();
    }));
}
