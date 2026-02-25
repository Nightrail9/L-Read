export const MODULE_META = [
    { key: "module_02", title: "框架图解读", category: "ARCHITECTURE", icon: "layout" },
    { key: "module_03", title: "公式讲解", category: "FORMULAS", icon: "zap" },
    { key: "module_04", title: "代码精读", category: "CODE", icon: "code" },
    { key: "module_05", title: "导师模拟提问", category: "ADVISOR-QA", icon: "message-circle" },
];

export const MODULE_KEY_BY_TITLE = Object.fromEntries(
    MODULE_META.map((item) => [item.title, item.key])
);
