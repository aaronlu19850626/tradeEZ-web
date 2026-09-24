"use client";

import { useEffect, useState } from "react";

import { $createCodeNode } from "@lexical/code";
import { TOGGLE_LINK_COMMAND } from "@lexical/link";
import { INSERT_CHECK_LIST_COMMAND, INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND } from "@lexical/list";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createHeadingNode, $createQuoteNode } from "@lexical/rich-text";
import { $patchStyleText, $setBlocksType } from "@lexical/selection";
import { $createParagraphNode, $getSelection, $isRangeSelection, type ElementNode, FORMAT_TEXT_COMMAND } from "lexical";
import { createPortal } from "react-dom";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { LexicalColorPickerButton } from "./lexical-toolbar-controls";
import {
  TradeZellaBoldIcon,
  TradeZellaChevronDownIcon,
  TradeZellaClearFormattingIcon,
  TradeZellaCodeBlockIcon,
  TradeZellaCollapsibleIcon,
  TradeZellaItalicIcon,
  TradeZellaLinkIcon,
  TradeZellaListIcon,
  TradeZellaQuoteIcon,
  TradeZellaStrikethroughIcon,
  TradeZellaTextStyleIcon,
  TradeZellaUnderlineIcon,
} from "./lexical-tradezella-icons";

export function LexicalFloatingToolbar() {
  const [editor] = useLexicalComposerContext();
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || selection.isCollapsed()) {
          setPosition(null);
          return;
        }
        const domSelection = window.getSelection();
        const range = domSelection?.rangeCount ? domSelection.getRangeAt(0) : null;
        const rect = range?.getBoundingClientRect();
        if (!rect || rect.width === 0) {
          setPosition(null);
          return;
        }
        setPosition({
          top: Math.max(8, rect.top - 52),
          left: Math.max(8, rect.left),
        });
      });
    });
  }, [editor]);

  if (!position) return null;

  return createPortal(
    <div
      role="toolbar"
      aria-label="文本快捷操作"
      className="tradezella-floating-toolbar fixed z-50 flex h-[43px] items-center gap-0 rounded-[8px] border bg-popover p-1 text-popover-foreground shadow-lg"
      style={{ top: position.top, left: position.left }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="文本样式"
            className="flex h-8 w-[50px] items-center justify-center gap-1 rounded-lg border border-border bg-muted/40 px-1.5 text-muted-foreground"
          >
            <TradeZellaTextStyleIcon variant="paragraph" className="size-4 fill-current" />
            <TradeZellaChevronDownIcon className="size-4 fill-current" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={8} className="tradezella-popup-menu w-[220px]">
          {[
            { key: "paragraph", label: "正文", create: () => $createParagraphNode() },
            { key: "h1", label: "标题 1", create: () => $createHeadingNode("h1") },
            { key: "h2", label: "标题 2", create: () => $createHeadingNode("h2") },
            { key: "h3", label: "标题 3", create: () => $createHeadingNode("h3") },
            { key: "toggle-h1", label: "折叠标题 1", create: () => $createHeadingNode("h1") },
            { key: "toggle-h2", label: "折叠标题 2", create: () => $createHeadingNode("h2") },
            { key: "toggle-h3", label: "折叠标题 3", create: () => $createHeadingNode("h3") },
            { key: "quote", label: "引用", create: () => $createQuoteNode() },
            { key: "code", label: "代码块", create: () => $createCodeNode() },
          ].map((item) => (
            <DropdownMenuItem
              key={item.label}
              onSelect={() => {
                editor.update(() => {
                  const selection = $getSelection();
                  if (!$isRangeSelection(selection)) return;
                  $setBlocksType(selection, item.create as () => ElementNode);
                });
              }}
            >
              {item.key === "quote" ? (
                <TradeZellaQuoteIcon className="size-4 fill-current" />
              ) : item.key === "code" ? (
                <TradeZellaCodeBlockIcon className="size-4 fill-current" />
              ) : (
                <TradeZellaTextStyleIcon
                  variant={
                    item.key.includes("h1")
                      ? "h1"
                      : item.key.includes("h2")
                        ? "h2"
                        : item.key.includes("h3")
                          ? "h3"
                          : "paragraph"
                  }
                  className="size-4 fill-current"
                />
              )}
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <span className="mx-1 h-[35px] w-px bg-border" />

      <button
        type="button"
        className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="加粗"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}
      >
        <TradeZellaBoldIcon className="size-4 fill-current" />
      </button>
      <button
        type="button"
        className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="斜体"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}
      >
        <TradeZellaItalicIcon className="size-4 fill-current" />
      </button>
      <button
        type="button"
        className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="删除线"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough")}
      >
        <TradeZellaStrikethroughIcon className="size-4 fill-current" />
      </button>
      <button
        type="button"
        className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="下划线"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline")}
      >
        <TradeZellaUnderlineIcon className="size-4 fill-current" />
      </button>

      <LexicalColorPickerButton kind="text" variant="floating" />
      <LexicalColorPickerButton kind="background" variant="floating" />

      <button
        type="button"
        className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="清除格式"
        onClick={() => {
          editor.update(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) return;
            for (const format of [
              "bold",
              "italic",
              "underline",
              "strikethrough",
              "code",
              "subscript",
              "superscript",
              "highlight",
            ] as const) {
              selection.formatText(format, 0);
            }
            $patchStyleText(selection, { color: null, "background-color": null });
          });
        }}
      >
        <TradeZellaClearFormattingIcon className="size-4 fill-current" />
      </button>

      <span className="mx-1 h-[35px] w-px bg-border" />

      <button
        type="button"
        className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="链接"
        onClick={() => {
          const url = window.prompt("链接地址", "https://");
          if (url) editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
        }}
      >
        <TradeZellaLinkIcon className="size-4 fill-current" />
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="列表"
          >
            <TradeZellaListIcon className="size-4 fill-current" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={8} className="tradezella-popup-menu w-[220px]">
          <DropdownMenuItem onSelect={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)}>
            无序列表
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)}>
            有序列表
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined)}>
            待办列表
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <button
        type="button"
        className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="折叠容器"
      >
        <TradeZellaCollapsibleIcon className="size-4 fill-current" />
      </button>
    </div>,
    document.body,
  );
}
