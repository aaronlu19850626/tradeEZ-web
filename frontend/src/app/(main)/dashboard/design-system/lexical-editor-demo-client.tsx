"use client";

import { useState } from "react";

import { LexicalEditor } from "@/components/editor/lexical-editor";

const DEMO_TEMPLATES = [
  {
    id: "design-system-daily-plan",
    name: "每日交易计划",
    markdown: "## 市场环境\n\n## 观察名单\n\n## 风险边界",
  },
  {
    id: "design-system-daily-review",
    name: "盘后复盘",
    markdown: "## 今日表现\n\n## 做得好的地方\n\n## 明日改进",
  },
];

const DEMO_TAGS = ["策略", "风控", "日内"];

export function LexicalEditorDemoClient() {
  const [value, setValue] = useState("# 编辑器样例\n\n这是一个可复用的 Lexical 富文本编辑器。");
  const [tags, setTags] = useState<string[]>(["策略"]);

  return (
    <div className="h-[720px] overflow-hidden rounded-lg border">
      <LexicalEditor
        editorId="tradeez-design-system-editor"
        value={value}
        onChange={setValue}
        templates={DEMO_TEMPLATES}
        allTags={DEMO_TAGS}
        tags={tags}
        onTagsChange={setTags}
        onHistory={() => window.alert("历史版本已独立为通用控件")}
      />
    </div>
  );
}
