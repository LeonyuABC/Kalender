export const CALENDAR_EMOJIS = [
    "😊", "😄", "😐", "😔", "😢", "😎", "🫠", "🔥", "❤️", "🥱",
    "🥰", "😡", "🤧", "🎬", "🌟", "🍻", "🎉", "🛏️", "🏠", "🏛️",
    "📝", "📚", "💻", "🛒", "🚶", "🚲", "🚗", "🚌", "🚄", "✈️"
];

export const MEAT_CATEGORIES = [
    { id: "beef", label: "牛肉", color: "red" },
    { id: "chicken", label: "鸡肉", color: "white" },
    { id: "pork", label: "猪肉", color: "yellow" },
    { id: "seafood", label: "海鲜", color: "blue" },
    { id: "other", label: "其他", color: "green" }
];

export function meatCategory(value) {
    return MEAT_CATEGORIES.find((item) => item.id === value)
        || MEAT_CATEGORIES[MEAT_CATEGORIES.length - 1];
}
