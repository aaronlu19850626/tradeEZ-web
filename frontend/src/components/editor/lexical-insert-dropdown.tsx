"use client";

import { type ReactNode, useState } from "react";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { INSERT_HORIZONTAL_RULE_COMMAND } from "@lexical/react/LexicalHorizontalRuleNode";
import { $createTableNodeWithDimensions } from "@lexical/table";
import { $getRoot, $getSelection, $insertNodes, $isRangeSelection, type LexicalNode } from "lexical";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocale } from "@/lib/i18n";

import {
  TradeZellaCollapsibleIcon,
  TradeZellaColumnsIcon,
  TradeZellaEquationIcon,
  TradeZellaHorizontalRuleIcon,
  TradeZellaImageIcon,
  TradeZellaInlineImageIcon,
  TradeZellaInsertIcon,
  TradeZellaListIcon,
  TradeZellaPageBreakIcon,
  TradeZellaTableIcon,
  TradeZellaTextStyleIcon,
  TradeZellaToggleIcon,
  TradeZellaTweetIcon,
  TradeZellaYouTubeIcon,
} from "./lexical-tradezella-icons";
import {
  $createTradeZellaColumnsNode,
  $createTradeZellaEmbedNode,
  $createTradeZellaEquationNode,
  $createTradeZellaImageNode,
  $createTradeZellaPageBreakNode,
  $createTradeZellaTimedListNode,
  $createTradeZellaToggleNode,
} from "./lexical-tradezella-nodes";

type DialogKind = "inline-image" | "table" | "columns" | "equation" | "tweet" | "youtube";
const DEFAULT_TABLE_ROWS = "5";
const DEFAULT_TABLE_COLUMNS = "5";
const DEFAULT_TABLE_HEADERS = { rows: true, columns: true } as const;

const COPY = {
  "zh-CN": {
    trigger: "插入",
    horizontalRule: "分割线",
    pageBreak: "分页符",
    image: "图片",
    inlineImage: "行内图片",
    table: "表格",
    columns: "分栏布局",
    equationItem: "公式",
    toggle: "折叠项",
    toggleHeading1: "折叠标题 1",
    toggleHeading2: "折叠标题 2",
    toggleHeading3: "折叠标题 3",
    timedList: "时间列表",
    collapsible: "折叠容器",
    tweet: "X（推文）",
    youtube: "YouTube 视频",
    cancel: "取消",
    confirm: "确认",
    insert: "插入",
    embed: "嵌入",
    rows: "行数",
    columnsCount: "列数",
    rowsPlaceholder: "行数（1-500）",
    columnsPlaceholder: "列数（1-50）",
    imageFile: "上传图片",
    altText: "替代文本",
    altPlaceholder: "描述图片内容",
    position: "位置",
    left: "左侧",
    right: "右侧",
    full: "全宽",
    center: "居中",
    showCaption: "显示说明",
    caption: "图片说明",
    equationInline: "行内公式",
    equation: "公式",
    equationPlaceholder: "例如：E = mc^2",
    visualization: "预览",
    columnsSelect: "布局",
    columnsTwo: "两列（等宽）",
    columnsThree: "三列（等宽）",
    columnsFour: "四列（等宽）",
    xUrl: "X 链接",
    youtubeUrl: "YouTube 链接",
    required: "此项不能为空",
    invalidUrl: "请输入有效链接",
    invalidRows: "行数需为 1-500",
    invalidColumns: "列数需为 1-50",
    dialogInlineImage: "插入行内图片",
    dialogInlineImageDescription: "上传图片并设置替代文本、位置和说明。",
    dialogTable: "插入表格",
    dialogTableDescription: "设置表格的行数和列数。",
    dialogColumns: "插入分栏布局",
    dialogColumnsDescription: "选择等宽分栏数量。",
    dialogEquation: "插入公式",
    dialogEquationDescription: "输入公式源码并选择行内或块级显示。",
    dialogTweet: "嵌入 X 推文",
    dialogTweetDescription: "粘贴 X 推文链接。",
    dialogYouTube: "嵌入 YouTube 视频",
    dialogYouTubeDescription: "粘贴 YouTube 视频链接。",
  },
  "en-US": {
    trigger: "Insert",
    horizontalRule: "Horizontal rule",
    pageBreak: "Page break",
    image: "Image",
    inlineImage: "Inline image",
    table: "Table",
    columns: "Columns layout",
    equationItem: "Equation",
    toggle: "Toggle",
    toggleHeading1: "Toggle Heading 1",
    toggleHeading2: "Toggle Heading 2",
    toggleHeading3: "Toggle Heading 3",
    timedList: "Timed List",
    collapsible: "Collapsible container",
    tweet: "X(Tweet)",
    youtube: "YouTube video",
    cancel: "Cancel",
    confirm: "Confirm",
    insert: "Insert",
    embed: "Embed",
    rows: "Rows",
    columnsCount: "Columns",
    rowsPlaceholder: "# of rows (1-500)",
    columnsPlaceholder: "# of columns (1-50)",
    imageFile: "Image Upload",
    altText: "Alt Text",
    altPlaceholder: "Descriptive alternative text",
    position: "Position",
    left: "Left",
    right: "Right",
    full: "Full Width",
    center: "Center",
    showCaption: "Show Caption",
    caption: "Caption",
    equationInline: "Inline",
    equation: "Equation",
    equationPlaceholder: "e.g. E = mc^2",
    visualization: "Visualization",
    columnsSelect: "Layout",
    columnsTwo: "2 columns (equal width)",
    columnsThree: "3 columns (equal width)",
    columnsFour: "4 columns (equal width)",
    xUrl: "X URL",
    youtubeUrl: "YouTube URL",
    required: "This field is required",
    invalidUrl: "Enter a valid URL",
    invalidRows: "Rows must be between 1 and 500",
    invalidColumns: "Columns must be between 1 and 50",
    dialogInlineImage: "Insert inline image",
    dialogInlineImageDescription: "Upload an image and set alt text, position, and caption.",
    dialogTable: "Insert table",
    dialogTableDescription: "Set the number of rows and columns.",
    dialogColumns: "Insert columns layout",
    dialogColumnsDescription: "Choose an equal-width column layout.",
    dialogEquation: "Insert equation",
    dialogEquationDescription: "Enter an equation and choose inline or display mode.",
    dialogTweet: "Embed x tweet",
    dialogTweetDescription: "Paste an X post URL.",
    dialogYouTube: "Embed YouTube video",
    dialogYouTubeDescription: "Paste a YouTube video URL.",
  },
} as const;

export function LexicalInsertDropdown() {
  const [editor] = useLexicalComposerContext();
  const locale = useLocale();
  const copy = COPY[locale];
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [rows, setRows] = useState(DEFAULT_TABLE_ROWS);
  const [columnsCount, setColumnsCount] = useState(DEFAULT_TABLE_COLUMNS);
  const [inlineImageFile, setInlineImageFile] = useState<File | null>(null);
  const [altText, setAltText] = useState("");
  const [position, setPosition] = useState<"left" | "center" | "right" | "full">("left");
  const [showCaption, setShowCaption] = useState(false);
  const [caption, setCaption] = useState("");
  const [layoutColumns, setLayoutColumns] = useState("2");
  const [equation, setEquation] = useState("");
  const [equationInline, setEquationInline] = useState(true);
  const [embedUrl, setEmbedUrl] = useState("");
  const [error, setError] = useState("");

  const resetDialog = () => {
    setDialog(null);
    setError("");
    setRows(DEFAULT_TABLE_ROWS);
    setColumnsCount(DEFAULT_TABLE_COLUMNS);
    setInlineImageFile(null);
    setAltText("");
    setPosition("left");
    setShowCaption(false);
    setCaption("");
    setEquation("");
    setEquationInline(true);
    setEmbedUrl("");
  };

  const insertNode = (nodeFactory: () => LexicalNode) => {
    editor.update(() => {
      const node = nodeFactory();
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $insertNodes([node]);
        return;
      }
      $getRoot().append(node);
    });
  };

  const chooseBlockImage = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      void fileToDataUrl(file).then((src) => {
        insertNode(() => $createTradeZellaImageNode({ src, inline: false, width: 720, alignment: "full" }));
      });
    };
    input.click();
  };

  const handleConfirm = () => {
    if (dialog === "table") {
      const nextRows = Number(rows);
      const nextColumns = Number(columnsCount);
      if (!Number.isInteger(nextRows) || nextRows < 1 || nextRows > 500) {
        setError(copy.invalidRows);
        return;
      }
      if (!Number.isInteger(nextColumns) || nextColumns < 1 || nextColumns > 50) {
        setError(copy.invalidColumns);
        return;
      }
      editor.update(() => {
        $insertNodes([$createTableNodeWithDimensions(nextRows, nextColumns, DEFAULT_TABLE_HEADERS)]);
      });
      resetDialog();
      return;
    }

    if (dialog === "inline-image") {
      if (!inlineImageFile) {
        setError(copy.required);
        return;
      }
      void fileToDataUrl(inlineImageFile).then((src) => {
        insertNode(() =>
          $createTradeZellaImageNode({
            altText,
            alignment: position,
            caption,
            inline: true,
            showCaption,
            src,
            width: position === "full" ? 720 : 280,
          }),
        );
        resetDialog();
      });
      return;
    }

    if (dialog === "columns") {
      insertNode(() => $createTradeZellaColumnsNode(Number(layoutColumns)));
      resetDialog();
      return;
    }

    if (dialog === "equation") {
      if (!equation.trim()) {
        setError(copy.required);
        return;
      }
      insertNode(() => $createTradeZellaEquationNode(equation.trim(), equationInline));
      resetDialog();
      return;
    }

    if (dialog === "tweet" || dialog === "youtube") {
      if (!isValidEmbedUrl(embedUrl, dialog)) {
        setError(copy.invalidUrl);
        return;
      }
      insertNode(() => $createTradeZellaEmbedNode({ kind: dialog === "tweet" ? "tweet" : "youtube", url: embedUrl }));
      resetDialog();
    }
  };

  const dialogTitleByKind: Record<DialogKind, string> = {
    "inline-image": copy.dialogInlineImage,
    table: copy.dialogTable,
    columns: copy.dialogColumns,
    equation: copy.dialogEquation,
    tweet: copy.dialogTweet,
    youtube: copy.dialogYouTube,
  };
  const dialogDescriptionByKind: Record<DialogKind, string> = {
    "inline-image": copy.dialogInlineImageDescription,
    table: copy.dialogTableDescription,
    columns: copy.dialogColumnsDescription,
    equation: copy.dialogEquationDescription,
    tweet: copy.dialogTweetDescription,
    youtube: copy.dialogYouTubeDescription,
  };
  const dialogTitle = dialog ? dialogTitleByKind[dialog] : "";
  const dialogDescription = dialog ? dialogDescriptionByKind[dialog] : "";

  const confirmDisabled =
    (dialog === "table" && (!isIntegerInRange(rows, 1, 500) || !isIntegerInRange(columnsCount, 1, 50))) ||
    (dialog === "inline-image" && !inlineImageFile) ||
    (dialog === "equation" && !equation.trim()) ||
    ((dialog === "tweet" || dialog === "youtube") && !isValidEmbedUrl(embedUrl, dialog));

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="toolbar-item toolbar-icon-button"
            aria-label={copy.trigger}
            title={copy.trigger}
            data-tradezella-insert="true"
          >
            <TradeZellaInsertIcon className="size-4 fill-current" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={8} className="tradezella-popup-menu w-[170px]">
          <InsertItem
            icon={<TradeZellaHorizontalRuleIcon className="size-4 fill-current" />}
            label={copy.horizontalRule}
            onSelect={() => editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)}
          />
          <InsertItem
            icon={<TradeZellaPageBreakIcon className="size-4 fill-current" />}
            label={copy.pageBreak}
            onSelect={() => insertNode(() => $createTradeZellaPageBreakNode())}
          />
          <InsertItem
            icon={<TradeZellaImageIcon className="size-4 fill-current" />}
            label={copy.image}
            onSelect={chooseBlockImage}
          />
          <InsertItem
            icon={<TradeZellaInlineImageIcon className="size-4 fill-current" />}
            label={copy.inlineImage}
            onSelect={() => setDialog("inline-image")}
          />
          <InsertItem
            icon={<TradeZellaTableIcon className="size-4 fill-current" />}
            label={copy.table}
            onSelect={() => setDialog("table")}
          />
          <InsertItem
            icon={<TradeZellaColumnsIcon className="size-4 fill-current" />}
            label={copy.columns}
            onSelect={() => setDialog("columns")}
          />
          <InsertItem
            icon={<TradeZellaEquationIcon className="size-4 fill-current" />}
            label={copy.equationItem}
            onSelect={() => setDialog("equation")}
          />
          <InsertItem
            icon={<TradeZellaToggleIcon className="size-4 fill-current" />}
            label={copy.toggle}
            onSelect={() => insertNode(() => $createTradeZellaToggleNode({ variant: "toggle", title: "" }))}
          />
          <InsertItem
            icon={<TradeZellaTextStyleIcon variant="h1" className="size-4 fill-current" />}
            label={copy.toggleHeading1}
            onSelect={() => insertNode(() => $createTradeZellaToggleNode({ variant: "h1", title: "" }))}
          />
          <InsertItem
            icon={<TradeZellaTextStyleIcon variant="h2" className="size-4 fill-current" />}
            label={copy.toggleHeading2}
            onSelect={() => insertNode(() => $createTradeZellaToggleNode({ variant: "h2", title: "" }))}
          />
          <InsertItem
            icon={<TradeZellaTextStyleIcon variant="h3" className="size-4 fill-current" />}
            label={copy.toggleHeading3}
            onSelect={() => insertNode(() => $createTradeZellaToggleNode({ variant: "h3", title: "" }))}
          />
          <InsertItem
            icon={<TradeZellaListIcon className="size-4 fill-current" />}
            label={copy.timedList}
            onSelect={() => insertNode(() => $createTradeZellaTimedListNode())}
          />
          <InsertItem
            icon={<TradeZellaCollapsibleIcon className="size-4 fill-current" />}
            label={copy.collapsible}
            onSelect={() => insertNode(() => $createTradeZellaToggleNode({ variant: "collapsible", title: "" }))}
          />
          <InsertItem
            icon={<TradeZellaTweetIcon className="size-4 fill-current" />}
            label={copy.tweet}
            onSelect={() => setDialog("tweet")}
          />
          <InsertItem
            icon={<TradeZellaYouTubeIcon className="size-4 fill-current" />}
            label={copy.youtube}
            onSelect={() => setDialog("youtube")}
          />
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog !== null} onOpenChange={(open) => (open ? undefined : resetDialog())}>
        <DialogContent className="sm:max-w-md" closeLabel={locale === "zh-CN" ? "关闭" : "Close"}>
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {dialog === "table" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="insert-table-rows">{copy.rows}</Label>
                  <Input
                    id="insert-table-rows"
                    type="number"
                    min={1}
                    max={500}
                    value={rows}
                    placeholder={copy.rowsPlaceholder}
                    onChange={(event) => setRows(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="insert-table-columns">{copy.columnsCount}</Label>
                  <Input
                    id="insert-table-columns"
                    type="number"
                    min={1}
                    max={50}
                    value={columnsCount}
                    placeholder={copy.columnsPlaceholder}
                    onChange={(event) => setColumnsCount(event.target.value)}
                  />
                </div>
              </>
            ) : null}

            {dialog === "inline-image" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="insert-inline-image">{copy.imageFile}</Label>
                  <Input
                    id="insert-inline-image"
                    type="file"
                    accept="image/*"
                    onChange={(event) => setInlineImageFile(event.target.files?.[0] ?? null)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="insert-inline-alt">{copy.altText}</Label>
                  <Input
                    id="insert-inline-alt"
                    value={altText}
                    placeholder={copy.altPlaceholder}
                    onChange={(event) => setAltText(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{copy.position}</Label>
                  <Select value={position} onValueChange={(value) => setPosition(value as typeof position)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">{copy.left}</SelectItem>
                      <SelectItem value="center">{copy.center}</SelectItem>
                      <SelectItem value="right">{copy.right}</SelectItem>
                      <SelectItem value="full">{copy.full}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={showCaption} onCheckedChange={(value) => setShowCaption(Boolean(value))} />
                  <Label>{copy.showCaption}</Label>
                </div>
                {showCaption ? (
                  <div className="space-y-2">
                    <Label htmlFor="insert-inline-caption">{copy.caption}</Label>
                    <Input
                      id="insert-inline-caption"
                      value={caption}
                      onChange={(event) => setCaption(event.target.value)}
                    />
                  </div>
                ) : null}
              </>
            ) : null}

            {dialog === "columns" ? (
              <div className="space-y-2">
                <Label>{copy.columnsSelect}</Label>
                <Select value={layoutColumns} onValueChange={setLayoutColumns}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">{copy.columnsTwo}</SelectItem>
                    <SelectItem value="3">{copy.columnsThree}</SelectItem>
                    <SelectItem value="4">{copy.columnsFour}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {dialog === "equation" ? (
              <>
                <div className="flex items-center gap-2">
                  <Checkbox checked={equationInline} onCheckedChange={(value) => setEquationInline(Boolean(value))} />
                  <Label>{copy.equationInline}</Label>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="insert-equation">{copy.equation}</Label>
                  <Input
                    id="insert-equation"
                    value={equation}
                    placeholder={copy.equationPlaceholder}
                    onChange={(event) => setEquation(event.target.value)}
                  />
                </div>
              </>
            ) : null}

            {dialog === "tweet" || dialog === "youtube" ? (
              <div className="space-y-2">
                <Label htmlFor="insert-embed-url">{dialog === "tweet" ? copy.xUrl : copy.youtubeUrl}</Label>
                <Input
                  id="insert-embed-url"
                  value={embedUrl}
                  placeholder={
                    dialog === "tweet" ? "https://x.com/jack/status/20" : "https://www.youtube.com/watch?v=jNQXAC9IVRw"
                  }
                  onChange={(event) => setEmbedUrl(event.target.value)}
                />
              </div>
            ) : null}

            {error ? <p className="text-destructive text-sm">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={resetDialog}>
              {copy.cancel}
            </Button>
            <Button type="button" disabled={confirmDisabled} onClick={handleConfirm}>
              {dialog === "tweet" || dialog === "youtube" ? copy.embed : copy.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function InsertItem({ icon, label, onSelect }: { icon: ReactNode; label: string; onSelect: () => void }) {
  return (
    <DropdownMenuItem onSelect={onSelect}>
      {icon}
      {label}
    </DropdownMenuItem>
  );
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function isValidEmbedUrl(value: string, kind: "tweet" | "youtube") {
  try {
    const url = new URL(value);
    if (kind === "tweet") return /(^|\.)x\.com$|(^|\.)twitter\.com$/.test(url.hostname);
    return /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(url.hostname);
  } catch {
    return false;
  }
}

function isIntegerInRange(value: string, minimum: number, maximum: number) {
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= maximum;
}
