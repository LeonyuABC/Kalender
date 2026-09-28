import { dateFromIso, localToday } from "./storage.js";

const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

function fallback(date) {
    return {
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
        weekday: WEEKDAYS[date.getDay()],
        lunarLabel: "农历信息暂不可用",
        festival: "",
        ganzhi: "",
        times: ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"].map((zhi) => ({ zhi, luck: "平" }))
    };
}

export function almanacForDate(value = localToday()) {
    const date = dateFromIso(value);
    const basic = fallback(date);
    if (!globalThis.Solar || Number.isNaN(date.getTime())) return basic;
    try {
        const solar = globalThis.Solar.fromYmd(date.getFullYear(), date.getMonth() + 1, date.getDate());
        const lunar = solar.getLunar();
        const labels = [
            lunar.getJieQi(),
            ...(solar.getFestivals?.() || []),
            ...(lunar.getFestivals?.() || []),
            ...(lunar.getOtherFestivals?.() || [])
        ].filter(Boolean);
        const uniqueLabels = [...new Set(labels)];
        const times = lunar.getTimes().slice(0, 12).map((time) => ({
            zhi: time.getZhi(),
            luck: time.getTianShenLuck() || "平"
        }));
        return {
            ...basic,
            lunarLabel: `农历${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
            festival: uniqueLabels.slice(0, 2).join(" · "),
            ganzhi: `${lunar.getYearInGanZhi()}年 ${lunar.getDayInGanZhi()}日`,
            times
        };
    } catch (error) {
        console.warn("黄历计算失败。", error);
        return basic;
    }
}
