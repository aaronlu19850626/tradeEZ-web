"use client";

import { useEffect } from "react";

import { useLocale } from "@/lib/i18n";

const ZH_LABELS: Record<string, string> = {
  Normal: "正文",
  "Heading 1": "标题 1",
  "Heading 2": "标题 2",
  "Heading 3": "标题 3",
  "Bullet List": "无序列表",
  "Numbered List": "有序列表",
  "Check List": "待办列表",
  Paragraph: "正文",
  Bulleted: "无序列表",
  Numbered: "有序列表",
  Quote: "引用",
  Code: "代码块",
  Bold: "加粗",
  Italic: "斜体",
  Strikethrough: "删除线",
  Underline: "下划线",
  Link: "链接",
  "Format text": "格式",
  "Left Align": "左对齐",
  "Center Align": "居中对齐",
  "Right Align": "右对齐",
  "Justify Align": "两端对齐",
  "Start Align": "起始端对齐",
  "End Align": "末尾端对齐",
  Outdent: "减少缩进",
  Indent: "增加缩进",
  Insert: "插入",
  "Horizontal rule": "分割线",
  Divider: "分割线",
  "Page break": "分页符",
  "Page Break": "分页符",
  Footnote: "脚注",
  Image: "图片",
  "Inline image": "行内图片",
  Table: "表格",
  "Columns layout": "分栏布局",
  "Columns Layout": "分栏布局",
  Equation: "公式",
  Toggle: "折叠容器",
  "Toggle Heading 1": "折叠标题 1",
  "Toggle Heading 2": "折叠标题 2",
  "Toggle Heading 3": "折叠标题 3",
  "Timed List": "时间列表",
  "Collapsible container": "折叠容器",
  "X(Tweet)": "X（推文）",
  "YouTube video": "YouTube 视频",
  "Background color": "背景颜色",
  "Toggle Row Striping": "切换行条纹",
  "Vertical Align": "垂直对齐",
  "Toggle First Row Freeze": "冻结首行",
  "Toggle First Column Freeze": "冻结首列",
  "Insert row above": "在上方插入行",
  "Insert row below": "在下方插入行",
  "Insert column left": "在左侧插入列",
  "Insert column right": "在右侧插入列",
  "Delete column": "删除列",
  "Delete row": "删除行",
  "Delete table": "删除表格",
  "Remove row header": "移除行表头",
  "Add column header": "添加列表头",
  "Top Align": "顶端对齐",
  "Middle Align": "垂直居中",
  "Bottom Align": "底端对齐",
};

const TABLE_ACTION_LABELS: Record<string, string> = {
  "table-merge-cells": "合并单元格",
  "table-unmerge-cells": "拆分单元格",
  "table-background-color": "背景颜色",
  "table-row-striping": "切换行条纹",
  "table-freeze-first-row": "冻结首行",
  "table-freeze-first-column": "冻结首列",
  "table-insert-row-above": "在上方插入行",
  "table-insert-row-below": "在下方插入行",
  "table-insert-column-before": "在左侧插入列",
  "table-insert-column-after": "在右侧插入列",
  "table-delete-columns": "删除列",
  "table-delete-rows": "删除行",
  "table-delete": "删除表格",
};

const INSERT_MENU_ORDER: Record<string, number> = {
  分割线: 10,
  分页符: 20,
  图片: 30,
  行内图片: 40,
  表格: 50,
  分栏布局: 60,
  公式: 70,
  折叠项: 80,
  Toggle: 80,
  折叠标题1: 90,
  ToggleHeading1: 90,
  折叠标题2: 100,
  ToggleHeading2: 100,
  折叠标题3: 110,
  ToggleHeading3: 110,
  时间列表: 120,
  TimedList: 120,
  折叠容器: 130,
  Collapsiblecontainer: 130,
  "X（推文）": 130,
  "X(Tweet)": 130,
  YouTube视频: 150,
  YouTubevideo: 150,
};

function translateTextNode(node: Node) {
  const parent = node.parentElement;
  if (!parent || parent.closest('[contenteditable="true"]')) return;
  const current = node.textContent?.trim();
  if (!current) return;
  const translated = ZH_LABELS[current];
  if (!translated || translated === current) return;
  node.textContent = node.textContent?.replace(current, translated) ?? translated;
}

function organizeInsertMenus() {
  for (const menu of document.querySelectorAll<HTMLElement>(".dropdown")) {
    const labels = [...menu.querySelectorAll<HTMLButtonElement>("button.item")].map((item) =>
      (item.querySelector(".text")?.textContent?.trim() || item.textContent.trim()).replace(/\s+/g, ""),
    );

    const isInsertMenu = labels.some((label) => label === "分割线" || label === "分页符" || label === "表格");
    const isFontMenu = labels.some((label) =>
      ["Arial", "CourierNew", "Georgia", "TimesNewRoman", "TrebuchetMS", "Verdana"].includes(label),
    );

    if (isInsertMenu) {
      menu.classList.add("tradezella-insert-popup");
      for (const item of menu.querySelectorAll<HTMLButtonElement>("button.item")) {
        const label = item.querySelector(".text")?.textContent?.trim().replace(/\s+/g, "") || "";
        if (label === "脚注" || label === "Footnote") {
          item.style.display = "none";
          continue;
        }
        const order = INSERT_MENU_ORDER[label];
        if (order) item.style.order = String(order);
      }
    }

    if (isFontMenu) {
      menu.classList.add("tradezella-font-popup");
    }
  }
}

function translateTableActionMenus() {
  for (const text of document.querySelectorAll<HTMLElement>('[data-test-id^="table-"] .text')) {
    const action = text.closest<HTMLElement>("[data-test-id]")?.dataset.testId;
    if (!action) continue;

    let translated = TABLE_ACTION_LABELS[action];
    if (action === "table-row-header") {
      translated = text.textContent?.trim().startsWith("Remove") ? "移除行表头" : "添加行表头";
    }
    if (action === "table-column-header") {
      translated = text.textContent?.trim().startsWith("Remove") ? "移除列表头" : "添加列表头";
    }
    if (translated && text.textContent !== translated) text.textContent = translated;
  }
}

function updateEditorPlaceholder(locale: "zh-CN" | "en-US") {
  const placeholderText =
    locale === "zh-CN" ? "把今天的交易心得，慢慢写下来吧…" : "Take a moment to capture today's trading lessons…";
  for (const placeholder of document.querySelectorAll<HTMLElement>(".ContentEditable__placeholder")) {
    if (placeholder.textContent !== placeholderText) placeholder.textContent = placeholderText;
  }
  document
    .querySelector<HTMLElement>('[data-lexical-editor="true"]')
    ?.setAttribute("aria-placeholder", placeholderText);
}

export function LexicalToolbarLocalizer() {
  const locale = useLocale();

  useEffect(() => {
    let frame = 0;
    const translate = () => {
      updateEditorPlaceholder(locale);
      if (locale === "zh-CN") {
        translateTableActionMenus();
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
          translateTextNode(node);
          node = walker.nextNode();
        }
        organizeInsertMenus();
      }
    };
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(translate);
    };

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [locale]);

  return null;
}
