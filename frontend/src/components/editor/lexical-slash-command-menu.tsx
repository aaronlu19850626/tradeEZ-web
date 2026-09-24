"use client";

import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  registerCheckList,
} from "@lexical/list";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from "@lexical/react/LexicalTypeaheadMenuPlugin";
import { $createHeadingNode } from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import { $createTableNodeWithDimensions } from "@lexical/table";
import { $insertNodeToNearestRoot } from "@lexical/utils";
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_CRITICAL,
  type TextNode,
} from "lexical";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocale } from "@/lib/i18n";

import {
  TradeZellaCheckListIcon,
  TradeZellaImageIcon,
  TradeZellaListIcon,
  TradeZellaNumberedListIcon,
  TradeZellaTableIcon,
  TradeZellaTextStyleIcon,
} from "./lexical-tradezella-icons";
import { $createTradeZellaImageNode } from "./lexical-tradezella-nodes";

type SlashCommandKind = "normal" | "h1" | "h2" | "h3" | "bullet" | "number" | "check" | "table" | "image";
const DEFAULT_TABLE_ROWS = "5";
const DEFAULT_TABLE_COLUMNS = "5";
const DEFAULT_TABLE_HEADERS = { rows: true, columns: true } as const;

class SlashCommandOption extends MenuOption {
  constructor(
    public label: string,
    public shortcut: string | null,
    public kind: SlashCommandKind,
    public icon: ReactNode,
    public keywords: string[],
  ) {
    super(kind);
  }
}

const COPY = {
  "zh-CN": {
    normal: "正文",
    h1: "标题 1",
    h2: "标题 2",
    h3: "标题 3",
    bullet: "无序列表",
    number: "有序列表",
    check: "待办列表",
    table: "插入表格",
    image: "插入图片",
    rows: "行数",
    columns: "列数",
    cancel: "取消",
    confirm: "确认",
  },
  "en-US": {
    normal: "Normal",
    h1: "Heading 1",
    h2: "Heading 2",
    h3: "Heading 3",
    bullet: "Bulleted List",
    number: "Numbered List",
    check: "Check List",
    table: "Insert Table",
    image: "Insert Image",
    rows: "Rows",
    columns: "Columns",
    cancel: "Cancel",
    confirm: "Confirm",
  },
} as const;

function SlashCommandMenuList({
  onHighlight,
  onSelect,
  options,
  selectedIndex,
}: {
  onHighlight: (index: number) => void;
  onSelect: (option: SlashCommandOption, index: number) => void;
  options: SlashCommandOption[];
  selectedIndex: number | null;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (options.length === 0) return;
    const menu = menuRef.current;
    if (!menu) return;
    const positionMenu = () => {
      const rect = menu.getBoundingClientRect();
      if (rect.bottom <= window.innerHeight - 12) return;
      menu.style.setProperty("position", "fixed", "important");
      menu.style.setProperty("z-index", "80", "important");
      menu.style.setProperty(
        "left",
        `${Math.max(12, Math.min(rect.left, window.innerWidth - rect.width - 12))}px`,
        "important",
      );
      menu.style.setProperty("top", `${Math.max(12, rect.top - rect.height - 12)}px`, "important");
    };
    positionMenu();
    const frame = window.requestAnimationFrame(positionMenu);
    const timeout = window.setTimeout(positionMenu, 80);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [options.length]);

  return (
    <div ref={menuRef} className="tradezella-slash-menu">
      {options.map((option, index) => (
        <div key={option.key}>
          <button
            type="button"
            className={`tradezella-slash-item ${selectedIndex === index ? "is-selected" : ""}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(option, index)}
            onMouseMove={(event) => {
              if (event.movementX !== 0 || event.movementY !== 0) onHighlight(index);
            }}
          >
            <span className="tradezella-slash-icon">{option.icon}</span>
            <span className="tradezella-slash-label">{option.label}</span>
            {option.shortcut ? <span className="tradezella-slash-shortcut">{option.shortcut}</span> : null}
          </button>
          {option.kind === "h3" || option.kind === "check" ? <div className="tradezella-slash-divider" /> : null}
        </div>
      ))}
    </div>
  );
}

export function LexicalSlashCommandMenu() {
  const [editor] = useLexicalComposerContext();
  const locale = useLocale();
  const copy = COPY[locale];
  const [query, setQuery] = useState<string | null>(null);
  const [tableOpen, setTableOpen] = useState(false);
  const [rows, setRows] = useState(DEFAULT_TABLE_ROWS);
  const [columns, setColumns] = useState(DEFAULT_TABLE_COLUMNS);
  const triggerFn = useBasicTypeaheadTriggerMatch("/", { minLength: 0, allowWhitespace: false });

  useEffect(() => registerCheckList(editor), [editor]);
  useEffect(() => {
    document.documentElement.classList.add("tradeez-custom-slash-menu");
    return () => document.documentElement.classList.remove("tradeez-custom-slash-menu");
  }, []);

  const options = useMemo(() => {
    const all = [
      new SlashCommandOption(
        copy.normal,
        "⌘+Opt+0",
        "normal",
        <TradeZellaTextStyleIcon variant="paragraph" className="size-4 fill-current" />,
        ["normal", "paragraph", "text"],
      ),
      new SlashCommandOption(
        copy.h1,
        "⌘+Opt+1",
        "h1",
        <TradeZellaTextStyleIcon variant="h1" className="size-4 fill-current" />,
        ["h1", "heading", "title"],
      ),
      new SlashCommandOption(
        copy.h2,
        "⌘+Opt+2",
        "h2",
        <TradeZellaTextStyleIcon variant="h2" className="size-4 fill-current" />,
        ["h2", "heading", "title"],
      ),
      new SlashCommandOption(
        copy.h3,
        "⌘+Opt+3",
        "h3",
        <TradeZellaTextStyleIcon variant="h3" className="size-4 fill-current" />,
        ["h3", "heading", "title"],
      ),
      new SlashCommandOption(copy.bullet, "⌘+Opt+4", "bullet", <TradeZellaListIcon className="size-4 fill-current" />, [
        "bullet",
        "list",
      ]),
      new SlashCommandOption(
        copy.number,
        "⌘+Opt+5",
        "number",
        <TradeZellaNumberedListIcon className="size-4 fill-current" />,
        ["number", "ordered", "list"],
      ),
      new SlashCommandOption(
        copy.check,
        "⌘+Opt+6",
        "check",
        <TradeZellaCheckListIcon className="size-4 fill-current" />,
        ["check", "todo", "list"],
      ),
      new SlashCommandOption(copy.table, null, "table", <TradeZellaTableIcon className="size-4 fill-current" />, [
        "table",
        "grid",
      ]),
      new SlashCommandOption(copy.image, null, "image", <TradeZellaImageIcon className="size-4 fill-current" />, [
        "image",
        "photo",
      ]),
    ];
    if (!query) return all;
    const regex = new RegExp(query, "i");
    return all.filter((option) => regex.test(option.label) || option.keywords.some((keyword) => regex.test(keyword)));
  }, [copy, query]);

  const insertTable = () => {
    const rowCount = Number(rows);
    const columnCount = Number(columns);
    if (!Number.isInteger(rowCount) || !Number.isInteger(columnCount)) return;
    editor.update(() => {
      $insertNodeToNearestRoot($createTableNodeWithDimensions(rowCount, columnCount, DEFAULT_TABLE_HEADERS));
    });
    setRows(DEFAULT_TABLE_ROWS);
    setColumns(DEFAULT_TABLE_COLUMNS);
    setTableOpen(false);
  };

  const closeTableDialog = () => {
    setTableOpen(false);
    setRows(DEFAULT_TABLE_ROWS);
    setColumns(DEFAULT_TABLE_COLUMNS);
  };

  const chooseImage = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const src = String(reader.result);
        editor.update(() => {
          $insertNodeToNearestRoot($createTradeZellaImageNode({ src, inline: false, width: 720, alignment: "full" }));
        });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }, [editor]);

  const runCommand = useCallback(
    (kind: SlashCommandKind, nodeToRemove: TextNode | null, closeMenu: () => void) => {
      if (kind === "table") {
        editor.update(() => nodeToRemove?.remove());
        closeMenu();
        setTableOpen(true);
        return;
      }
      if (kind === "image") {
        editor.update(() => nodeToRemove?.remove());
        closeMenu();
        chooseImage();
        return;
      }
      editor.update(() => {
        nodeToRemove?.remove();
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        if (kind === "normal") $setBlocksType(selection, () => $createParagraphNode());
        if (kind === "h1") $setBlocksType(selection, () => $createHeadingNode("h1"));
        if (kind === "h2") $setBlocksType(selection, () => $createHeadingNode("h2"));
        if (kind === "h3") $setBlocksType(selection, () => $createHeadingNode("h3"));
      });
      if (kind === "bullet") editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
      if (kind === "number") editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
      if (kind === "check") editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined);
      closeMenu();
    },
    [chooseImage, editor],
  );

  return (
    <>
      <LexicalTypeaheadMenuPlugin<SlashCommandOption>
        onQueryChange={setQuery}
        onSelectOption={(option, nodeToRemove, closeMenu) => runCommand(option.kind, nodeToRemove, closeMenu)}
        options={options}
        triggerFn={triggerFn}
        commandPriority={COMMAND_PRIORITY_CRITICAL}
        anchorClassName="tradezella-typeahead-anchor"
        menuRenderFn={(anchorRef, { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }) =>
          anchorRef.current && options.length
            ? createPortal(
                <SlashCommandMenuList
                  onHighlight={setHighlightedIndex}
                  onSelect={(option, index) => {
                    setHighlightedIndex(index);
                    selectOptionAndCleanUp(option);
                  }}
                  options={options}
                  selectedIndex={selectedIndex}
                />,
                anchorRef.current,
              )
            : null
        }
      />
      <Dialog
        open={tableOpen}
        onOpenChange={(open) => {
          setTableOpen(open);
          if (!open) {
            setRows(DEFAULT_TABLE_ROWS);
            setColumns(DEFAULT_TABLE_COLUMNS);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{copy.table}</DialogTitle>
            <DialogDescription />
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="slash-table-rows">{copy.rows}</Label>
              <Input
                id="slash-table-rows"
                type="number"
                min={1}
                max={500}
                value={rows}
                onChange={(event) => setRows(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slash-table-columns">{copy.columns}</Label>
              <Input
                id="slash-table-columns"
                type="number"
                min={1}
                max={50}
                value={columns}
                onChange={(event) => setColumns(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeTableDialog}>
              {copy.cancel}
            </Button>
            <Button type="button" onClick={insertTable}>
              {copy.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
