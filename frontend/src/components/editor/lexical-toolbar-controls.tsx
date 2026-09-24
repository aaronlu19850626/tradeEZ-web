"use client";

import { Fragment, type ReactNode, useEffect, useState } from "react";

import { $createCodeNode, $isCodeNode } from "@lexical/code";
import { TOGGLE_LINK_COMMAND } from "@lexical/link";
import { INSERT_CHECK_LIST_COMMAND, INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND } from "@lexical/list";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createHeadingNode, $createQuoteNode, $isHeadingNode, $isQuoteNode } from "@lexical/rich-text";
import { $getSelectionStyleValueForProperty, $patchStyleText, $setBlocksType } from "@lexical/selection";
import { $findMatchingParent, $insertNodeToNearestRoot } from "@lexical/utils";
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_LOW,
  type ElementNode,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  INDENT_CONTENT_COMMAND,
  type LexicalNode,
  OUTDENT_CONTENT_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
} from "lexical";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLocale } from "@/lib/i18n";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

import { LexicalToolbarTooltip } from "./lexical-toolbar-tooltip";
import {
  TradeZellaAlignIcon,
  TradeZellaBackgroundColorIcon,
  TradeZellaBoldIcon,
  TradeZellaCheckListIcon,
  TradeZellaChevronDownIcon,
  TradeZellaClearFormattingIcon,
  TradeZellaCodeBlockIcon,
  TradeZellaFontFamilyIcon,
  TradeZellaInsertIcon,
  TradeZellaItalicIcon,
  TradeZellaLinkIcon,
  TradeZellaListIcon,
  TradeZellaMinusIcon,
  TradeZellaNumberedListIcon,
  TradeZellaQuoteIcon,
  TradeZellaRedoIcon,
  TradeZellaStrikethroughIcon,
  TradeZellaTextColorIcon,
  TradeZellaTextStyleIcon,
  TradeZellaUnderlineIcon,
  TradeZellaUndoIcon,
} from "./lexical-tradezella-icons";
import { $createTradeZellaToggleNode } from "./lexical-tradezella-nodes";

import "./lexical-toolbar-controls.css";

const COPY = {
  "zh-CN": {
    format: "格式",
    bold: "加粗",
    italic: "斜体",
    strike: "删除线",
    underline: "下划线",
    clear: "清除格式",
    textStyle: "文本样式",
    paragraph: "正文",
    heading1: "标题 1",
    heading2: "标题 2",
    heading3: "标题 3",
    toggleHeading1: "折叠标题 1",
    toggleHeading2: "折叠标题 2",
    toggleHeading3: "折叠标题 3",
    bulletList: "无序列表",
    numberedList: "有序列表",
    checkList: "待办列表",
    quote: "引用",
    code: "代码块",
  },
  "en-US": {
    format: "Format",
    bold: "Bold",
    italic: "Italic",
    strike: "Strikethrough",
    underline: "Underline",
    clear: "Clear formatting",
    textStyle: "Text style",
    paragraph: "Normal",
    heading1: "Heading 1",
    heading2: "Heading 2",
    heading3: "Heading 3",
    toggleHeading1: "Toggle Heading 1",
    toggleHeading2: "Toggle Heading 2",
    toggleHeading3: "Toggle Heading 3",
    bulletList: "Bullet list",
    numberedList: "Numbered list",
    checkList: "Check list",
    quote: "Quote",
    code: "Code block",
  },
} as const;

function clearFormatting(editor: ReturnType<typeof useLexicalComposerContext>[0]) {
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
}

export function LexicalFormatDropdown() {
  const [editor] = useLexicalComposerContext();
  const locale = useLocale();
  const copy = COPY[locale];

  return (
    <DropdownMenu>
      <LexicalToolbarTooltip label={copy.format}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="toolbar-item h-7 gap-1 px-2"
            aria-label={copy.format}
            title={copy.format}
            data-tradezella-format="true"
          >
            <TradeZellaBoldIcon className="size-3.5 fill-current" />
            <TradeZellaChevronDownIcon className="size-4 fill-current" />
          </Button>
        </DropdownMenuTrigger>
      </LexicalToolbarTooltip>
      <DropdownMenuContent
        align="start"
        sideOffset={8}
        className="tradezella-popup-menu tradezella-format-menu w-[230px]"
      >
        <DropdownMenuItem onSelect={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}>
          <TradeZellaBoldIcon className="size-4 fill-current" />
          {copy.bold}
          <DropdownMenuShortcut>⌘+B</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}>
          <TradeZellaItalicIcon className="size-4 fill-current" />
          {copy.italic}
          <DropdownMenuShortcut>⌘+I</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough")}>
          <TradeZellaStrikethroughIcon className="size-4 fill-current" />
          {copy.strike}
          <DropdownMenuShortcut>⌘+Shift+S</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline")}>
          <TradeZellaUnderlineIcon className="size-4 fill-current" />
          {copy.underline}
          <DropdownMenuShortcut>⌘+U</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type BlockKind = "paragraph" | "h1" | "h2" | "h3" | "quote" | "code";

function getTextStyleVariant(key: string): "paragraph" | "h1" | "h2" | "h3" {
  if (key === "paragraph") return "paragraph";
  if (key.includes("h1")) return "h1";
  if (key.includes("h2")) return "h2";
  return "h3";
}

function getCurrentBlockKind(editor: ReturnType<typeof useLexicalComposerContext>[0]): BlockKind {
  return editor.getEditorState().read(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return "paragraph";
    const block = $findMatchingParent(selection.anchor.getNode(), (parent) => {
      const type = parent.getType();
      return type === "heading" || type === "quote" || type === "code";
    });
    if (!block) return "paragraph";
    if ($isHeadingNode(block)) return block.getTag() as "h1" | "h2" | "h3";
    if ($isQuoteNode(block)) return "quote";
    if ($isCodeNode(block)) return "code";
    return "paragraph";
  });
}

export function LexicalTextStyleDropdown() {
  const [editor] = useLexicalComposerContext();
  const locale = useLocale();
  const copy = COPY[locale];
  const [currentBlock, setCurrentBlock] = useState<BlockKind>("paragraph");

  useEffect(() => {
    const sync = () => setCurrentBlock(getCurrentBlockKind(editor));
    sync();
    return editor.registerUpdateListener(sync);
  }, [editor]);

  const options = [
    { key: "paragraph", label: copy.paragraph, shortcut: "⌘+Opt+0", create: () => $createParagraphNode() },
    { key: "h1", label: copy.heading1, shortcut: "⌘+Opt+1", create: () => $createHeadingNode("h1") },
    { key: "h2", label: copy.heading2, shortcut: "⌘+Opt+2", create: () => $createHeadingNode("h2") },
    { key: "h3", label: copy.heading3, shortcut: "⌘+Opt+3", create: () => $createHeadingNode("h3") },
    { key: "toggle-h1", label: copy.toggleHeading1, create: () => $createHeadingNode("h1") },
    { key: "toggle-h2", label: copy.toggleHeading2, create: () => $createHeadingNode("h2") },
    { key: "toggle-h3", label: copy.toggleHeading3, create: () => $createHeadingNode("h3") },
  ] as const;

  return (
    <DropdownMenu>
      <LexicalToolbarTooltip label={copy.textStyle}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="toolbar-item h-7 gap-1 px-2 text-sm"
            aria-label={copy.textStyle}
            title={copy.textStyle}
            data-tradezella-text-style="true"
          >
            <TradeZellaTextStyleIcon
              variant={
                currentBlock === "h1" || currentBlock === "h2" || currentBlock === "h3" ? currentBlock : "paragraph"
              }
              className="size-4 fill-current"
            />
            <TradeZellaChevronDownIcon className="size-4 fill-current" />
          </Button>
        </DropdownMenuTrigger>
      </LexicalToolbarTooltip>
      <DropdownMenuContent
        align="start"
        sideOffset={8}
        className="tradezella-popup-menu tradezella-text-style-menu w-[232px]"
      >
        {options.map((item) => (
          <DropdownMenuItem
            key={item.key}
            onSelect={() => {
              editor.update(() => {
                const selection = $getSelection();
                if (!$isRangeSelection(selection)) return;
                if (item.key.startsWith("toggle")) {
                  const variant = item.key === "toggle-h1" ? "h1" : item.key === "toggle-h2" ? "h2" : "h3";
                  $insertNodeToNearestRoot($createTradeZellaToggleNode({ title: "", variant }));
                  return;
                }
                $setBlocksType(selection, item.create as () => ElementNode);
              });
            }}
          >
            <TradeZellaTextStyleIcon variant={getTextStyleVariant(item.key)} className="size-4 fill-current" />
            {item.label}
            {"shortcut" in item ? <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onSelect={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)}>
          <TradeZellaListIcon className="size-4 fill-current" />
          {copy.bulletList}
          <DropdownMenuShortcut>⌘+Opt+4</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)}>
          <TradeZellaNumberedListIcon className="size-4 fill-current" />
          {copy.numberedList}
          <DropdownMenuShortcut>⌘+Opt+5</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined)}>
          <TradeZellaCheckListIcon className="size-4 fill-current" />
          {copy.checkList}
          <DropdownMenuShortcut>⌘+Opt+6</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            editor.update(() => {
              const selection = $getSelection();
              if (!$isRangeSelection(selection)) return;
              $setBlocksType(selection, $createQuoteNode);
            })
          }
        >
          <TradeZellaQuoteIcon className="size-4 fill-current" />
          {copy.quote}
          <DropdownMenuShortcut>⌘+Opt+Q</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            editor.update(() => {
              const selection = $getSelection();
              if (!$isRangeSelection(selection)) return;
              $setBlocksType(selection, $createCodeNode);
            })
          }
        >
          <TradeZellaCodeBlockIcon className="size-4 fill-current" />
          {copy.code}
          <DropdownMenuShortcut>⌘+Opt+C</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const CODE_LANGUAGES = [
  ["plain", "Plain Text"],
  ["javascript", "JavaScript"],
  ["typescript", "TypeScript"],
  ["html", "HTML"],
  ["css", "CSS"],
  ["json", "JSON"],
  ["python", "Python"],
  ["bash", "Bash"],
  ["sql", "SQL"],
  ["markdown", "Markdown"],
] as const;

export function LexicalCodeLanguageDropdown() {
  const [editor] = useLexicalComposerContext();
  const locale = useLocale();
  const [language, setLanguage] = useState("javascript");
  const [isCodeBlock, setIsCodeBlock] = useState(false);

  useEffect(() => {
    const sync = () =>
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        const selectedCodeNode = $isRangeSelection(selection)
          ? $findMatchingParent(selection.anchor.getNode(), $isCodeNode)
          : null;
        const codeNode = selectedCodeNode ?? findFirstCodeNode($getRoot());
        setIsCodeBlock(Boolean(codeNode));
        if ($isCodeNode(codeNode)) setLanguage(codeNode.getLanguage() || "plain");
      });
    sync();
    return editor.registerUpdateListener(sync);
  }, [editor]);

  if (!isCodeBlock) return null;

  const updateLanguage = (value: string) => {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      const codeNode = $findMatchingParent(selection.anchor.getNode(), $isCodeNode);
      if ($isCodeNode(codeNode)) codeNode.setLanguage(value);
    });
    setLanguage(value);
  };

  const currentLabel = CODE_LANGUAGES.find(([value]) => value === language)?.[1] ?? "Plain Text";

  return (
    <DropdownMenu>
      <LexicalToolbarTooltip label={locale === "zh-CN" ? "选择代码语言" : "Select language"}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="toolbar-item"
            data-tradezella-code-language="true"
            aria-label={locale === "zh-CN" ? "选择代码语言" : "Select language"}
          >
            <span className="text-xs">{currentLabel}</span>
            <TradeZellaChevronDownIcon className="size-4 fill-current" />
          </Button>
        </DropdownMenuTrigger>
      </LexicalToolbarTooltip>
      <DropdownMenuContent align="start" sideOffset={8} className="tradezella-popup-menu w-[180px]">
        {CODE_LANGUAGES.map(([value, label]) => (
          <DropdownMenuItem key={value} onSelect={() => updateLanguage(value)}>
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function findFirstCodeNode(node: LexicalNode): LexicalNode | null {
  if ($isCodeNode(node)) return node;
  if (!$isElementNode(node)) return null;
  for (const child of node.getChildren()) {
    const codeNode = findFirstCodeNode(child);
    if (codeNode) return codeNode;
  }
  return null;
}

const FONT_FAMILIES = ["Arial", "Courier New", "Georgia", "Times New Roman", "Trebuchet MS", "Verdana"] as const;

export function LexicalFontFamilyDropdown() {
  const [editor] = useLexicalComposerContext();
  const [fontFamily, setFontFamily] = useState("Arial");

  useEffect(() => {
    const sync = () =>
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          setFontFamily($getSelectionStyleValueForProperty(selection, "font-family", "Arial"));
        }
      });
    sync();
    return editor.registerUpdateListener(sync);
  }, [editor]);

  const updateFontFamily = (value: string) => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) $patchStyleText(selection, { "font-family": value });
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="toolbar-item"
          aria-label="Formatting options for font family"
          data-tradezella-font-family="true"
        >
          <TradeZellaFontFamilyIcon className="size-4 fill-current" />
          <span className="min-w-0 flex-1 truncate text-left">{fontFamily}</span>
          <TradeZellaChevronDownIcon className="size-4 fill-current" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={8} className="tradezella-popup-menu w-[180px]">
        {FONT_FAMILIES.map((font) => (
          <DropdownMenuItem key={font} onSelect={() => updateFontFamily(font)}>
            <span className="truncate">{font}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function LexicalFontSizeControl() {
  const [editor] = useLexicalComposerContext();
  const [fontSize, setFontSize] = useState("15");

  useEffect(() => {
    const sync = () =>
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          setFontSize($getSelectionStyleValueForProperty(selection, "font-size", "15px").replace("px", ""));
        }
      });
    sync();
    return editor.registerUpdateListener(sync);
  }, [editor]);

  const updateFontSize = (value: string) => {
    const numeric = Math.max(8, Math.min(72, Number(value)));
    if (!Number.isInteger(numeric)) return;
    setFontSize(String(numeric));
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) $patchStyleText(selection, { "font-size": `${numeric}px` });
    });
  };

  return (
    <div className="toolbar-item tradezella-font-size-control" data-tradezella-font-size="true">
      <LexicalToolbarTooltip label="Decrease font size">
        <button
          type="button"
          aria-label="Decrease font size"
          onClick={() => updateFontSize(String(Number(fontSize) - 1))}
        >
          <TradeZellaMinusIcon className="size-4 fill-current" />
        </button>
      </LexicalToolbarTooltip>
      <LexicalToolbarTooltip label="Font size">
        <input
          type="number"
          min={8}
          max={72}
          value={fontSize}
          aria-label="Font size"
          onChange={(event) => updateFontSize(event.target.value)}
        />
      </LexicalToolbarTooltip>
      <LexicalToolbarTooltip label="Increase font size">
        <button
          type="button"
          aria-label="Increase font size"
          onClick={() => updateFontSize(String(Number(fontSize) + 1))}
        >
          <TradeZellaInsertIcon className="size-4 fill-current" />
        </button>
      </LexicalToolbarTooltip>
    </div>
  );
}

export function LexicalLinkButton() {
  const [editor] = useLexicalComposerContext();

  return (
    <LexicalToolbarTooltip label="Insert link">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="toolbar-item toolbar-icon-button"
        aria-label="Insert link"
        data-tradezella-link="true"
        onClick={() => {
          const url = window.prompt("Link URL", "https://");
          if (url) editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
        }}
      >
        <TradeZellaLinkIcon className="size-4 fill-current" />
      </Button>
    </LexicalToolbarTooltip>
  );
}

export function LexicalUndoRedoButtons() {
  const [editor] = useLexicalComposerContext();
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    const unregisterUndo = editor.registerCommand(
      CAN_UNDO_COMMAND,
      (payload) => {
        setCanUndo(payload);
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
    const unregisterRedo = editor.registerCommand(
      CAN_REDO_COMMAND,
      (payload) => {
        setCanRedo(payload);
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
    return () => {
      unregisterUndo();
      unregisterRedo();
    };
  }, [editor]);

  return (
    <>
      <LexicalToolbarTooltip label="Undo">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="toolbar-item toolbar-icon-button"
          aria-label="Undo"
          data-tradezella-undo="true"
          disabled={!canUndo}
          onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
        >
          <TradeZellaUndoIcon className="size-4 fill-current" />
        </Button>
      </LexicalToolbarTooltip>
      <LexicalToolbarTooltip label="Redo">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="toolbar-item toolbar-icon-button"
          aria-label="Redo"
          data-tradezella-redo="true"
          disabled={!canRedo}
          onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
        >
          <TradeZellaRedoIcon className="size-4 fill-current" />
        </Button>
      </LexicalToolbarTooltip>
    </>
  );
}

export function LexicalClearFormattingButton() {
  const [editor] = useLexicalComposerContext();
  const locale = useLocale();
  const copy = COPY[locale];

  return (
    <LexicalToolbarTooltip label={copy.clear}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="toolbar-item toolbar-icon-button"
        aria-label={copy.clear}
        title={copy.clear}
        onClick={() => clearFormatting(editor)}
      >
        <TradeZellaClearFormattingIcon className="size-4 fill-current" />
      </Button>
    </LexicalToolbarTooltip>
  );
}

const ALIGNMENT_COPY = {
  "zh-CN": {
    align: "对齐",
    left: "左对齐",
    center: "居中对齐",
    right: "右对齐",
    justify: "两端对齐",
    start: "起始端对齐",
    end: "末尾端对齐",
    outdent: "减少缩进",
    indent: "增加缩进",
  },
  "en-US": {
    align: "Alignment",
    left: "Left align",
    center: "Center align",
    right: "Right align",
    justify: "Justify align",
    start: "Start align",
    end: "End align",
    outdent: "Outdent",
    indent: "Indent",
  },
} as const;

export function LexicalAlignmentDropdown() {
  const [editor] = useLexicalComposerContext();
  const locale = useLocale();
  const copy = ALIGNMENT_COPY[locale];
  const items = [
    { key: "left", label: copy.left, shortcut: "⌘+Shift+L" },
    { key: "center", label: copy.center, shortcut: "⌘+Shift+E" },
    { key: "right", label: copy.right, shortcut: "⌘+Shift+R" },
    { key: "justify", label: copy.justify, shortcut: "⌘+Shift+J" },
    { key: "start", label: copy.start },
    { key: "end", label: copy.end },
    { key: "outdent", label: copy.outdent, shortcut: "⌘+[" },
    { key: "indent", label: copy.indent, shortcut: "⌘+]" },
  ] as const;

  return (
    <DropdownMenu>
      <LexicalToolbarTooltip label={copy.align}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="toolbar-item"
            aria-label={copy.align}
            title={copy.align}
            data-tradezella-alignment="true"
          >
            <TradeZellaAlignIcon variant="left" className="size-4 fill-current" />
            <TradeZellaChevronDownIcon className="size-4 fill-current" />
          </Button>
        </DropdownMenuTrigger>
      </LexicalToolbarTooltip>
      <DropdownMenuContent
        align="start"
        sideOffset={8}
        className="tradezella-popup-menu tradezella-align-menu w-[230px]"
      >
        {items.map((item) => (
          <Fragment key={item.key}>
            {item.key === "outdent" ? <DropdownMenuSeparator className="my-1" /> : null}
            <DropdownMenuItem
              onSelect={() => {
                if (item.key === "outdent") {
                  editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined);
                  return;
                }
                if (item.key === "indent") {
                  editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined);
                  return;
                }
                editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, item.key);
              }}
            >
              <TradeZellaAlignIcon variant={item.key} className="size-4 fill-current" />
              {item.label}
              {"shortcut" in item ? <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut> : null}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type ColorPreset = {
  label: string;
  light: string;
  dark: string;
};

const TEXT_COLOR_PRESETS: ColorPreset[] = [
  { label: "Gray", light: "#616161", dark: "#bdbdbd" },
  { label: "Brown", light: "#78350f", dark: "#fcd34d" },
  { label: "Orange", light: "#b33e00", dark: "#ffcc80" },
  { label: "Yellow", light: "#b45309", dark: "#fff176" },
  { label: "Green", light: "#14684f", dark: "#7ed7b2" },
  { label: "Blue", light: "#1976d2", dark: "#64b5f6" },
  { label: "Purple", light: "#6853b5", dark: "#a196d6" },
  { label: "Pink", light: "#be185d", dark: "#f9a8d4" },
  { label: "Red", light: "#b22323", dark: "#f8a9a9" },
  { label: "Black", light: "#000000", dark: "#ffffff" },
];

const BACKGROUND_COLOR_PRESETS: ColorPreset[] = [
  { label: "Gray", light: "#e0e0e0", dark: "#424242" },
  { label: "Brown", light: "#bcaaa4", dark: "#5d4037" },
  { label: "Orange", light: "#f9c88a", dark: "#854a01" },
  { label: "Yellow", light: "#ffe47f", dark: "#6b5a1b" },
  { label: "Green", light: "#4ebf94", dark: "#035c45" },
  { label: "Blue", light: "#82a1f5", dark: "#173178" },
  { label: "Purple", light: "#cac0f0", dark: "#392e64" },
  { label: "Pink", light: "#f48fb1", dark: "#880e4f" },
  { label: "Red", light: "#ff8d89", dark: "#822121" },
];

const COLOR_COPY = {
  "zh-CN": {
    textColor: "文字颜色",
    backgroundColor: "背景颜色",
    helper: "预设颜色会自动适配浅色和深色主题",
    default: "默认",
  },
  "en-US": {
    textColor: "Text color",
    backgroundColor: "Highlight color",
    helper: "Preset colors adapt to light and dark theme",
    default: "Default",
  },
} as const;

export function LexicalColorPickerButton({
  kind,
  variant = "toolbar",
}: {
  kind: "text" | "background";
  variant?: "toolbar" | "floating";
}) {
  const [editor] = useLexicalComposerContext();
  const locale = useLocale();
  const resolvedThemeMode = usePreferencesStore((state) => state.resolvedThemeMode);
  const copy = COLOR_COPY[locale];
  const presets = kind === "text" ? TEXT_COLOR_PRESETS : BACKGROUND_COLOR_PRESETS;
  const isDark = resolvedThemeMode === "dark";
  const [selectedValue, setSelectedValue] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sync = () =>
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const value = $getSelectionStyleValueForProperty(selection, kind === "text" ? "color" : "background-color", "");
        setSelectedValue(value.trim() || null);
      });
    sync();
    return editor.registerUpdateListener(sync);
  }, [editor, kind]);

  const applyColor = (value: string | null) => {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      $patchStyleText(selection, kind === "text" ? { color: value } : { "background-color": value });
    });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <LexicalToolbarTooltip label={kind === "text" ? copy.textColor : copy.backgroundColor}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={
              variant === "toolbar"
                ? "toolbar-item toolbar-icon-button"
                : "flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            }
            aria-label={kind === "text" ? copy.textColor : copy.backgroundColor}
            title={kind === "text" ? copy.textColor : copy.backgroundColor}
            data-tradezella-color-picker={kind}
          >
            {kind === "text" ? (
              <TradeZellaTextColorIcon className="size-4 fill-current" />
            ) : (
              <TradeZellaBackgroundColorIcon className="size-4 fill-current" />
            )}
          </Button>
        </PopoverTrigger>
      </LexicalToolbarTooltip>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="tradezella-color-picker-popover w-[216px] gap-0 rounded-xl p-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          editor.focus();
        }}
      >
        <p className="tradezella-color-picker-helper">{copy.helper}</p>
        <div
          className="tradezella-color-picker-list"
          role="radiogroup"
          aria-label={kind === "text" ? copy.textColor : copy.backgroundColor}
        >
          <ColorPickerRow
            label={copy.default}
            title={copy.default}
            selected={!selectedValue}
            onSelect={() => applyColor(null)}
            preview={<DefaultColorPreview />}
          />
          {presets.map((preset) => {
            const value = isDark ? preset.dark : preset.light;
            return (
              <ColorPickerRow
                key={preset.label}
                label={preset.label}
                title={`${preset.label} (${isDark ? "dark" : "light"}: ${value})`}
                selected={selectedValue?.toLowerCase() === value.toLowerCase()}
                onSelect={() => applyColor(value)}
                preview={<ThemeColorPairPreview kind={kind} preset={preset} />}
              />
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ColorPickerRow({
  label,
  preview,
  selected,
  title,
  onSelect,
}: {
  label: string;
  preview: ReactNode;
  selected: boolean;
  title: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      title={title}
      className="tradezella-color-picker-row"
      data-selected={selected ? "true" : "false"}
      onClick={onSelect}
    >
      <span className="tradezella-color-picker-preview">{preview}</span>
      <span className="truncate">{label}</span>
      {selected ? <Check aria-hidden="true" className="ml-auto size-4 shrink-0" strokeWidth={2.5} /> : null}
    </button>
  );
}

function DefaultColorPreview() {
  return (
    <svg className="tradezella-color-default-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1" />
      <line x1="3.5" y1="12.5" x2="12.5" y2="3.5" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function ThemeColorPairPreview({ kind, preset }: { kind: "text" | "background"; preset: ColorPreset }) {
  const lightStyle =
    kind === "background"
      ? { backgroundColor: preset.light, color: "#111111" }
      : { backgroundColor: "#ffffff", color: preset.light };
  const darkStyle =
    kind === "background"
      ? { backgroundColor: preset.dark, color: "#ffffff" }
      : { backgroundColor: "#111111", color: preset.dark };
  return (
    <span className="tradezella-color-pair" aria-hidden="true">
      <span className="tradezella-color-pair-chip" style={lightStyle}>
        L
      </span>
      <span className="tradezella-color-pair-chip" style={darkStyle}>
        D
      </span>
    </span>
  );
}
