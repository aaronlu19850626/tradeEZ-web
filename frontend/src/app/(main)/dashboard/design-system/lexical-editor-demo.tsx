"use client";

import dynamic from "next/dynamic";

export const LexicalEditorDemo = dynamic(
  () => import("./lexical-editor-demo-client").then((module) => module.LexicalEditorDemoClient),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[560px] items-center justify-center rounded-lg border bg-muted/20 text-muted-foreground text-sm">
        正在加载 Lexical 编辑器…
      </div>
    ),
  },
);
