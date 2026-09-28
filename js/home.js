import { almanacForDate } from "./almanac.js";
import {
    KINDS,
    dateFromIso,
    escapeHtml,
    formatChineseDate,
    generateId,
    isIsoDate,
    loadData,
    localToday,
    safeText,
    updateData
} from "./storage.js";

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];
const CATEGORY_META = {
    personal: { label: "个人", color: "blue" },
    activity: { label: "活动", color: "green" },
    guest: { label: "客房", color: "yellow" }
};

const EVENT_EMOJI_GROUPS = [
    { label: "学习", items: ["📚", "📝", "💻", "🎓", "📖", "🧠"] },
    { label: "生活", items: ["🛒", "🏠", "🧹", "🍳", "💳", "📦"] },
    { label: "活动", items: ["🏆", "🎉", "🎭", "🎵", "⚽", "🤝"] },
    { label: "出行", items: ["🚄", "✈️", "🚗", "🚌", "🚲", "🧳"] },
    { label: "办事", items: ["📄", "🏦", "🪪", "🏥", "📞", "❗"] }
];

const JOURNAL_EMOJIS = [
    "😊", "😄", "🥳", "😌", "😎", "🤔", "😐", "😴", "😔", "😢",
    "😤", "😡", "😰", "🤒", "💪", "🙏", "❤️", "🌟", "☀️", "🌧️"
];

let visibleMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedDate = localToday();
let planBoardDate = localToday();
let planEditing = false;

function isoFromParts(year, monthIndex, day) {
    return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthLabel(date) {
    return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function sanitizeEvent(value) {
    if (!value || value.kind !== KINDS.calendar) return null;
    const category = Object.hasOwn(CATEGORY_META, value.category) ? value.category : "personal";
    const title = safeText(value.title, 200);
    const date = safeText(value.date || value.startDate, 10);
    const endDate = safeText(value.endDate || date, 10);
    if (!value.id || !title || !isIsoDate(date) || !isIsoDate(endDate)) return null;
    return {
        kind: KINDS.calendar,
        id: value.id,
        category,
        emoji: category === "guest" ? "" : (safeText(value.emoji, 16, "📌") || "📌"),
        title,
        details: safeText(value.details, 5000),
        date,
        endDate: category === "guest" && endDate >= date ? endDate : date,
        createdAt: safeText(value.createdAt, 50) || new Date().toISOString(),
        updatedAt: safeText(value.updatedAt, 50) || new Date().toISOString()
    };
}

function calendarEvents() {
    return loadData().plans.map(sanitizeEvent).filter(Boolean);
}

function eventOccursOn(event, date) {
    return event.date <= date && event.endDate >= date;
}

function dailyPlansFor(date) {
    return loadData().plans
        .filter((item) => item.kind === KINDS.daily && item.date === date)
        .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
}

function renderTodayPanel() {
    const info = almanacForDate(localToday());
    const plans = dailyPlansFor(planBoardDate).slice(0, 8);
    const rows = Array.from({ length: 8 }, (_, index) => {
        const item = plans[index];
        if (planEditing) {
            return `<div class="today-plan-row editing">
                <input name="planTime-${index}" maxlength="50" value="${escapeHtml(item?.timeLabel || "")}" placeholder="时间">
                <input name="planText-${index}" maxlength="1000" value="${escapeHtml(item?.text || "")}" placeholder="填写事情">
            </div>`;
        }
        return `<div class="today-plan-row${item ? "" : " empty"}">
            <strong>${escapeHtml(item?.timeLabel || "")}</strong><span>${escapeHtml(item?.text || "")}</span>
        </div>`;
    }).join("");
    const timeCells = info.times.map((item) => `
        <span class="hour-cell ${item.luck === "吉" ? "lucky" : item.luck === "凶" ? "unlucky" : "neutral"}">
            <b>${escapeHtml(item.zhi)}</b><small>${escapeHtml(item.luck)}</small>
        </span>`).join("");

    return `
        <section class="today-board" aria-label="今日概览">
            <article class="almanac-card">
                <div class="almanac-top"><span>${info.year}年${info.month}月</span><span>${info.weekday}</span></div>
                <div class="almanac-day">${info.day}</div>
                <p class="almanac-lunar">${escapeHtml(info.lunarLabel)}</p>
                <p class="almanac-ganzhi">${escapeHtml(info.festival || info.ganzhi)}</p>
                <div class="hour-grid" aria-label="十二时辰吉凶">${timeCells}</div>
            </article>
            <article class="today-plan-card">
                <header class="today-plan-heading">
                    <div class="plan-date-group">
                        <p class="eyebrow">${planBoardDate === localToday() ? "今日安排" : "日期安排"}</p>
                        <label class="plan-date-picker" aria-label="选择计划日期">
                            <span>📅</span><input id="plan-board-date" type="date" value="${planBoardDate}" ${planEditing ? "disabled" : ""}>
                        </label>
                    </div>
                    <button id="toggle-plan-edit" class="round-add${planEditing ? " save-mode" : ""}" type="button" aria-label="${planEditing ? "保存八行计划" : "编辑八行计划"}">${planEditing ? "保存" : "＋"}</button>
                </header>
                <div id="plan-board-rows" class="today-plan-lines${planEditing ? " editing" : ""}">${rows}</div>
            </article>
        </section>`;
}

function renderCalendarGrid(events, journals) {
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const firstMondayOffset = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = localToday();
    const cells = [];

    for (let offset = 0; offset < firstMondayOffset; offset += 1) {
        cells.push('<div class="calendar-cell outside" aria-hidden="true"></div>');
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
        const iso = isoFromParts(year, month, day);
        const dayEvents = events.filter((event) => eventOccursOn(event, iso));
        const journal = journals.get(iso);
        const markers = dayEvents.slice(0, 3).map((event) => `
            <span class="event-marker ${CATEGORY_META[event.category].color}">${escapeHtml(event.category === "guest" ? event.title : `${event.emoji} ${event.title}`)}</span>`).join("");
        const extra = dayEvents.length > 3 ? `<span class="calendar-more">还有${dayEvents.length - 3}项</span>` : "";
        cells.push(`
            <button class="calendar-cell${iso === selectedDate ? " selected" : ""}${iso === today ? " today" : ""}" type="button" data-calendar-date="${iso}">
                <span class="calendar-day-top"><span class="day-number">${day}</span>${journal ? `<span class="journal-day-emoji" title="当天有日记">${escapeHtml(journal.emoji || "📝")}</span>` : ""}</span>
                <span class="calendar-markers">${markers}${extra}</span>
            </button>`);
    }
    while (cells.length % 7 !== 0) cells.push('<div class="calendar-cell outside" aria-hidden="true"></div>');
    return cells.join("");
}

function journalFor(date) {
    return loadData().diaryEntries.find((item) => item.kind === KINDS.journal && item.date === date) || null;
}

function emojiRadio(name, emoji, selected, label = "") {
    return `<label class="emoji-choice" title="${escapeHtml(label || emoji)}">
        <input type="radio" name="${name}" value="${emoji}" ${emoji === selected ? "checked" : ""}>
        <span>${emoji}</span>
    </label>`;
}

function eventEmojiPicker(selected) {
    const available = EVENT_EMOJI_GROUPS.flatMap((group) => group.items);
    const current = available.includes(selected) ? selected : "📚";
    return `<div class="emoji-grid event-emoji-grid">${EVENT_EMOJI_GROUPS.map((group) =>
        group.items.map((emoji) => emojiRadio("emoji", emoji, current, `${group.label} ${emoji}`)).join("")
    ).join("")}</div>`;
}

function journalEmojiPicker(selected) {
    return `<div class="emoji-grid journal-emoji-grid">${JOURNAL_EMOJIS.map((emoji) => emojiRadio("journalEmoji", emoji, selected)).join("")}</div>`;
}

function selectedDayMarkup(events) {
    const items = events.filter((event) => eventOccursOn(event, selectedDate));
    const cards = items.length ? items.map((event) => {
        const meta = CATEGORY_META[event.category];
        const dates = event.category === "guest" && event.endDate !== event.date
            ? `${formatChineseDate(event.date)}—${formatChineseDate(event.endDate)}`
            : formatChineseDate(event.date);
        return `
            <article class="event-card ${meta.color}">
                <div class="event-card-main">
                    <h4>${escapeHtml(event.category === "guest" ? event.title : `${event.emoji} ${event.title}`)}</h4>
                    <p class="event-date">${escapeHtml(dates)}</p>
                    ${event.details ? `<p>${escapeHtml(event.details).replace(/\n/g, "<br>")}</p>` : ""}
                </div>
                <div class="card-actions">
                    <button type="button" class="text-button" data-edit-event="${escapeHtml(event.id)}">编辑</button>
                    <button type="button" class="text-button danger-text" data-delete-event="${escapeHtml(event.id)}">删除</button>
                </div>
            </article>`;
    }).join("") : '<p class="empty-copy">这一天还没有日历事项。</p>';
    const journal = journalFor(selectedDate);
    const journalEmoji = safeText(journal?.emoji, 8, "😊") || "😊";
    return `
        <section class="selected-day-panel">
            <div class="selected-day-heading">
                <div><p class="eyebrow">已选日期</p><h3>${formatChineseDate(selectedDate, { weekday: "long" })}</h3></div>
                <button id="add-calendar-event" class="primary-button" type="button">＋ 添加事项</button>
            </div>
            <div class="event-list">${cards}</div>
            <div class="journal-box">
                <div class="section-heading"><div><p class="eyebrow">当日日记</p><h3><span class="journal-title-emoji">${escapeHtml(journalEmoji)}</span> 记录这一天</h3></div><div class="journal-heading-actions"><span id="journal-save-status" class="save-hint"></span><button class="secondary-button" type="button" data-open-export>导出日记 Word</button></div></div>
                <div class="journal-emoji-picker"><span>选择当天心情</span>${journalEmojiPicker(journalEmoji)}</div>
                <textarea id="journal-body" rows="8" maxlength="30000" placeholder="写下今天发生的事情……">${escapeHtml(journal?.body || "")}</textarea>
                <div class="action-row"><button id="save-journal" class="secondary-button" type="button">保存日记</button></div>
            </div>
        </section>`;
}

function eventFormMarkup(event = null) {
    const current = event || {
        category: "personal",
        emoji: "📚",
        title: "",
        details: "",
        date: selectedDate,
        endDate: selectedDate
    };
    return `
        <form id="event-form" class="dialog-form">
            <div class="dialog-heading"><h2>${event ? "编辑事项" : "添加事项"}</h2><button type="button" class="dialog-x" data-close-dialog aria-label="关闭">×</button></div>
            <div class="field event-kind-field"><span>事项</span>
                <div class="event-color-picker" role="radiogroup" aria-label="事项颜色">
                    <label class="event-color-choice blue" title="个人"><input type="radio" name="category" value="personal" ${current.category === "personal" ? "checked" : ""}><span aria-hidden="true"></span></label>
                    <label class="event-color-choice green" title="活动"><input type="radio" name="category" value="activity" ${current.category === "activity" ? "checked" : ""}><span aria-hidden="true"></span></label>
                    <label class="event-color-choice yellow" title="客房"><input type="radio" name="category" value="guest" ${current.category === "guest" ? "checked" : ""}><span aria-hidden="true"></span></label>
                </div>
                <div class="event-standard-fields">${eventEmojiPicker(current.emoji)}</div>
            </div>
            <label class="field event-date-single"><span>日期</span><input name="date" type="date" value="${escapeHtml(current.date)}"></label>
            <div class="field event-guest-fields" hidden><span>日期</span>
                <div class="event-date-range">
                    <input name="startDate" aria-label="入住日期" type="date" value="${escapeHtml(current.date)}"><i aria-hidden="true">—</i>
                    <input name="endDate" aria-label="退房日期" type="date" value="${escapeHtml(current.endDate)}">
                </div>
            </div>
            <label class="field"><span>标题</span><input name="title" maxlength="200" value="${escapeHtml(current.title)}" required></label>
            <label class="field"><span>内容</span><textarea name="details" rows="4" maxlength="5000">${escapeHtml(current.details)}</textarea></label>
            <p class="form-error" aria-live="polite"></p>
            <div class="action-row"><button class="primary-button" type="submit">${event ? "保存修改" : "保存事项"}</button><button class="secondary-button" type="button" data-close-dialog>取消</button></div>
        </form>`;
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportJournals(scope, context) {
    const selectedYear = selectedDate.slice(0, 4);
    const selectedMonth = selectedDate.slice(0, 7);
    const entries = loadData().diaryEntries
        .filter((item) => item.kind === KINDS.journal && safeText(item.body, 30000))
        .filter((item) => scope === "all" || (scope === "year" ? item.date.startsWith(selectedYear) : item.date.startsWith(selectedMonth)))
        .sort((a, b) => a.date.localeCompare(b.date));
    if (!entries.length) {
        context.toast("所选范围内还没有日记。");
        return;
    }
    if (!globalThis.docx) {
        context.toast("Word导出组件未加载，请刷新后重试。");
        return;
    }
    const { Document, Packer, Paragraph, TextRun } = globalThis.docx;
    const children = [];
    entries.forEach((entry, index) => {
        const headingDate = dateFromIso(entry.date);
        const heading = `${headingDate.getFullYear()}年${headingDate.getMonth() + 1}月${headingDate.getDate()}日，${headingDate.toLocaleDateString("zh-CN", { weekday: "long" })}`;
        children.push(new Paragraph({
            children: [new TextRun({ text: heading, bold: true, size: 30, font: "Microsoft YaHei" })],
            spacing: { before: index ? 360 : 0, after: 180 }
        }));
        String(entry.body).split(/\r?\n/).forEach((line) => {
            children.push(new Paragraph({
                children: [new TextRun({ text: line || " ", size: 24, font: "Microsoft YaHei" })],
                spacing: { after: 120 },
                indent: { firstLine: 480 }
            }));
        });
    });
    const documentFile = new Document({ sections: [{ children }] });
    const blob = await Packer.toBlob(documentFile);
    const suffix = scope === "all" ? "全部" : scope === "year" ? selectedYear : selectedMonth;
    downloadBlob(blob, `我的日记-${suffix}.docx`);
    context.toast("Word日记已经生成。");
}

function bindEventDialog(container, context, rerender, event = null) {
    const dialog = container.querySelector("#event-dialog");
    dialog.innerHTML = eventFormMarkup(event);
    const form = dialog.querySelector("#event-form");
    const categoryRadios = [...form.querySelectorAll('input[name="category"]')];
    const standard = form.querySelector(".event-standard-fields");
    const singleDate = form.querySelector(".event-date-single");
    const guest = form.querySelector(".event-guest-fields");
    const emojiRadios = [...form.querySelectorAll('input[name="emoji"]')];
    const syncFields = () => {
        const isGuest = form.querySelector('input[name="category"]:checked')?.value === "guest";
        standard.hidden = isGuest;
        singleDate.hidden = isGuest;
        guest.hidden = !isGuest;
        emojiRadios.forEach((radio, index) => { radio.required = !isGuest && index === 0; });
        form.elements.date.required = !isGuest;
        form.elements.startDate.required = isGuest;
        form.elements.endDate.required = isGuest;
    };
    categoryRadios.forEach((radio) => radio.addEventListener("change", syncFields));
    syncFields();
    dialog.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => dialog.close()));
    form.addEventListener("submit", (submitEvent) => {
        submitEvent.preventDefault();
        if (!form.reportValidity()) return;
        const fields = new FormData(form);
        const isGuest = fields.get("category") === "guest";
        const date = isGuest ? fields.get("startDate") : fields.get("date");
        const endDate = isGuest ? fields.get("endDate") : date;
        if (!isIsoDate(date) || !isIsoDate(endDate) || endDate < date) {
            form.querySelector(".form-error").textContent = "请检查日期，退房日期不能早于入住日期。";
            return;
        }
        const next = sanitizeEvent({
            ...(event || {}),
            kind: KINDS.calendar,
            id: event?.id || generateId(),
            category: fields.get("category"),
            emoji: fields.get("emoji"),
            title: fields.get("title"),
            details: fields.get("details"),
            date,
            endDate,
            createdAt: event?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
        if (!next) {
            form.querySelector(".form-error").textContent = "请填写标题和正确的日期。";
            return;
        }
        updateData((data) => {
            const index = data.plans.findIndex((item) => item.id === next.id);
            if (index >= 0) data.plans[index] = next;
            else data.plans.push(next);
            return data;
        });
        selectedDate = next.date;
        visibleMonth = new Date(dateFromIso(next.date).getFullYear(), dateFromIso(next.date).getMonth(), 1);
        dialog.close();
        context.toast(event ? "事项已更新。" : "事项已添加。");
        rerender();
    });
    dialog.showModal();
}

export function renderHome(container, context) {
    const events = calendarEvents();
    const journals = new Map(loadData().diaryEntries
        .filter((item) => item.kind === KINDS.journal && isIsoDate(item.date))
        .map((item) => [item.date, item]));
    const rerender = () => renderHome(container, context);
    container.innerHTML = `
        <header class="page-header compact-header"><div><p class="eyebrow">个人日程</p><h1>今天，从这里开始 <span aria-hidden="true">✦</span></h1></div><span class="date-pill">${formatChineseDate(localToday(), { weekday: "long" })}</span></header>
        ${renderTodayPanel()}
        <section class="calendar-section">
            <div class="calendar-toolbar">
                <div><p class="eyebrow">日历</p><h2>${monthLabel(visibleMonth)}</h2></div>
                <div class="toolbar-actions">
                    <button class="secondary-button" type="button" data-open-export>导出日记 Word</button>
                    <button id="previous-month" class="icon-button" type="button" aria-label="上个月">‹</button>
                    <button id="today-month" class="text-button" type="button">今天</button>
                    <button id="next-month" class="icon-button" type="button" aria-label="下个月">›</button>
                </div>
            </div>
            <div class="weekday-row">${WEEKDAYS.map((day) => `<span>${day}</span>`).join("")}</div>
            <div class="calendar-grid">${renderCalendarGrid(events, journals)}</div>
            <div id="selected-day-host">${selectedDayMarkup(events)}</div>
        </section>
        <dialog id="event-dialog" class="app-dialog"></dialog>
        <dialog id="export-dialog" class="app-dialog">
            <form id="export-form" class="dialog-form">
                <div class="dialog-heading"><div><p class="eyebrow">Word导出</p><h2>导出日记</h2></div><button type="button" class="dialog-x" data-close-export aria-label="关闭">×</button></div>
                <label class="field"><span>导出范围</span><select name="scope"><option value="month">当前所选月份</option><option value="year">当前所选年份</option><option value="all">全部日记</option></select></label>
                <p class="muted">Word中只包含“日期＋星期＋正文”，不会导出Emoji和计划。</p>
                <div class="action-row"><button class="primary-button" type="submit">生成Word文档</button><button class="secondary-button" type="button" data-close-export>取消</button></div>
            </form>
        </dialog>`;

    container.querySelector("#plan-board-date").addEventListener("change", (event) => {
        if (!isIsoDate(event.target.value)) return;
        planBoardDate = event.target.value;
        planEditing = false;
        rerender();
    });
    container.querySelector("#toggle-plan-edit").addEventListener("click", () => {
        if (!planEditing) {
            planEditing = true;
            rerender();
            container.querySelector('[name="planTime-0"]')?.focus();
            return;
        }
        const rows = Array.from({ length: 8 }, (_, index) => ({
            timeLabel: safeText(container.querySelector(`[name="planTime-${index}"]`)?.value, 50),
            text: safeText(container.querySelector(`[name="planText-${index}"]`)?.value, 1000)
        }));
        updateData((data) => {
            const previous = data.plans
                .filter((item) => item.kind === KINDS.daily && item.date === planBoardDate)
                .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
            data.plans = data.plans.filter((item) => item.kind !== KINDS.daily || item.date !== planBoardDate);
            rows.forEach((row, index) => {
                if (!row.timeLabel && !row.text) return;
                data.plans.push({
                    kind: KINDS.daily,
                    id: previous[index]?.id || generateId(),
                    date: planBoardDate,
                    timeLabel: row.timeLabel,
                    text: row.text,
                    order: index + 1,
                    createdAt: previous[index]?.createdAt || new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                });
            });
            return data;
        });
        planEditing = false;
        context.toast("八行计划已保存。");
        rerender();
    });

    container.querySelector("#previous-month").addEventListener("click", () => {
        visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
        rerender();
    });
    container.querySelector("#next-month").addEventListener("click", () => {
        visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
        rerender();
    });
    container.querySelector("#today-month").addEventListener("click", () => {
        selectedDate = localToday();
        const today = new Date();
        visibleMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        rerender();
    });
    container.querySelectorAll("[data-calendar-date]").forEach((button) => button.addEventListener("click", () => {
        selectedDate = button.dataset.calendarDate;
        rerender();
    }));
    container.querySelector("#add-calendar-event").addEventListener("click", () => bindEventDialog(container, context, rerender));
    container.querySelectorAll("[data-edit-event]").forEach((button) => button.addEventListener("click", () => {
        const event = events.find((item) => item.id === button.dataset.editEvent);
        if (event) bindEventDialog(container, context, rerender, event);
    }));
    container.querySelectorAll("[data-delete-event]").forEach((button) => button.addEventListener("click", () => {
        if (!window.confirm("确定删除这个日历事项吗？")) return;
        updateData((data) => {
            data.plans = data.plans.filter((item) => item.id !== button.dataset.deleteEvent);
            return data;
        });
        context.toast("事项已删除。");
        rerender();
    }));

    container.querySelectorAll('input[name="journalEmoji"]').forEach((radio) => radio.addEventListener("change", () => {
        const titleEmoji = container.querySelector(".journal-title-emoji");
        if (titleEmoji && radio.checked) titleEmoji.textContent = radio.value;
    }));

    container.querySelector("#save-journal").addEventListener("click", () => {
        const body = safeText(container.querySelector("#journal-body").value, 30000);
        const emoji = safeText(container.querySelector('input[name="journalEmoji"]:checked')?.value, 8, "😊") || "😊";
        updateData((data) => {
            const index = data.diaryEntries.findIndex((item) => item.kind === KINDS.journal && item.date === selectedDate);
            if (!body) {
                if (index >= 0) data.diaryEntries.splice(index, 1);
                return data;
            }
            const entry = {
                kind: KINDS.journal,
                id: index >= 0 ? data.diaryEntries[index].id : `journal-${selectedDate}`,
                date: selectedDate,
                emoji,
                body,
                createdAt: index >= 0 ? data.diaryEntries[index].createdAt : new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            if (index >= 0) data.diaryEntries[index] = entry;
            else data.diaryEntries.push(entry);
            return data;
        });
        context.toast(body ? "日记已保存。" : "空日记已删除。");
        rerender();
    });

    const exportDialog = container.querySelector("#export-dialog");
    container.querySelectorAll("[data-open-export]").forEach((button) => button.addEventListener("click", () => exportDialog.showModal()));
    exportDialog.querySelectorAll("[data-close-export]").forEach((button) => button.addEventListener("click", () => exportDialog.close()));
    exportDialog.querySelector("#export-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const button = event.currentTarget.querySelector('[type="submit"]');
        button.disabled = true;
        button.textContent = "正在生成……";
        try {
            await exportJournals(new FormData(event.currentTarget).get("scope"), context);
            exportDialog.close();
        } catch (error) {
            console.error("Word导出失败。", error);
            context.toast("Word导出失败，请稍后重试。");
        } finally {
            button.disabled = false;
            button.textContent = "生成Word文档";
        }
    });
}
