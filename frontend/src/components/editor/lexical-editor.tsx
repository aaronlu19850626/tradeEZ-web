"use client";

import dynamic from "next/dynamic";

export const LexicalEditor = dynamic(
  () => import("./lexical-editor-client").then((module) => module.LexicalEditorClient),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-96 items-center justify-center text-muted-foreground text-sm">正在加载编辑器…</div>
    ),
  },
);
