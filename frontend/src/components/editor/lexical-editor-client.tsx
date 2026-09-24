"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

import { type SerializedDocument, serializedDocumentFromEditorState } from "@lexical/file";
import { createHeadlessEditor } from "@lexical/headless";
import {
  $convertFromMarkdownString,
  ELEMENT_TRANSFORMERS,
  MULTILINE_ELEMENT_TRANSFORMERS,
  TEXT_FORMAT_TRANSFORMERS,
  TEXT_MATCH_TRANSFORMERS,
} from "@lexical/markdown";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import nodes from "extendable-lexical-editor/editor-nodes";
import theme from "extendable-lexical-editor/editor-theme";
import ExtendableEditor from "extendable-lexical-editor/extendable-editor";
import { $createParagraphNode, $createTextNode, $getRoot, $insertNodes } from "lexical";
import { Sparkles, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLocale } from "@/lib/i18n";

import type { EditorTemplate } from "./editor-types";
import { LexicalFloatingToolbar } from "./lexical-floating-toolbar";
import { LexicalInsertDropdown } from "./lexical-insert-dropdown";
import { LexicalSlashCommandMenu } from "./lexical-slash-command-menu";
import {
  LexicalAlignmentDropdown,
  LexicalClearFormattingButton,
  LexicalCodeLanguageDropdown,
  LexicalColorPickerButton,
  LexicalFontSizeControl,
  LexicalFormatDropdown,
  LexicalLinkButton,
  LexicalTextStyleDropdown,
  LexicalUndoRedoButtons,
} from "./lexical-toolbar-controls";
import { LexicalToolbarLocalizer } from "./lexical-toolbar-localizer";
import { LexicalToolbarTooltip } from "./lexical-toolbar-tooltip";
import {
  TradeZellaFullscreenIcon,
  TradeZellaHistoryIcon,
  TradeZellaSpeechIcon,
  TradeZellaTagIcon,
  TradeZellaTemplateIcon,
} from "./lexical-tradezella-icons";
import { TRADEZELLA_NOTEBOOK_NODES } from "./lexical-tradezella-nodes";

import "extendable-lexical-editor/extendable-editor.css";
import "@/components/editor/lexical-toolbar-icons.css";
import "./lexical-editor.css";
import "./lexical-slash-command-menu.css";

const TRANSFORMERS = [
  ...ELEMENT_TRANSFORMERS,
  ...MULTILINE_ELEMENT_TRANSFORMERS,
  ...TEXT_FORMAT_TRANSFORMERS,
  ...TEXT_MATCH_TRANSFORMERS,
];

const NOTEBOOK_NODES = [...nodes, ...TRADEZELLA_NOTEBOOK_NODES];

const COPY = {
  "zh-CN": {
    ai: "AI",
    voice: "语音输入",
    stopVoice: "停止语音输入",
    template: "模板",
    templates: "模板",
    noTemplates: "暂无模板",
    tag: "标签",
    tags: "标签",
    filterTags: "筛选标签",
    selectAll: "全选",
    noTags: "暂无标签",
    createTag: "Create tag",
    history: "历史版本",
    fullscreen: "全屏",
    voiceUnsupported: "当前浏览器不支持语音输入",
  },
  "en-US": {
    ai: "AI",
    voice: "Voice input",
    stopVoice: "Stop voice input",
    template: "Template",
    templates: "Templates",
    noTemplates: "No templates",
    tag: "Tag",
    tags: "Tags",
    filterTags: "Filter tags",
    selectAll: "Select all",
    noTags: "No tags",
    createTag: "Create tag",
    history: "Version history",
    fullscreen: "Fullscreen",
    voiceUnsupported: "Speech input is not supported in this browser",
  },
} as const;

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
};

type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function markdownToDocument(markdown: string): SerializedDocument {
  const editor = createHeadlessEditor({
    namespace: "TradeEZEditor",
    nodes: NOTEBOOK_NODES,
    theme,
    onError: (error) => console.error(error),
  });

  editor.update(
    () => {
      if (!markdown.trim()) {
        $getRoot().clear();
        $getRoot().append($createParagraphNode());
        return;
      }
      $convertFromMarkdownString(markdown, TRANSFORMERS);
      if ($getRoot().getChildrenSize() === 0) {
        $getRoot().append($createParagraphNode());
      }
    },
    { discrete: true },
  );

  return serializedDocumentFromEditorState(editor.getEditorState(), { source: "TradeEZ" });
}

function documentToPlainText(document: SerializedDocument) {
  const editor = createHeadlessEditor({
    namespace: "TradeEZEditor",
    nodes: NOTEBOOK_NODES,
    theme,
    onError: (error) => console.error(error),
  });
  try {
    editor.setEditorState(editor.parseEditorState(document.editorState));
    return editor.getEditorState().read(() => $getRoot().getTextContent());
  } catch {
    return "";
  }
}

function ToolbarIconButton({ label, onClick, children }: { label: string; onClick?: () => void; children: ReactNode }) {
  return (
    <LexicalToolbarTooltip label={label}>
      <button
        type="button"
        className="toolbar-item toolbar-icon-button"
        aria-label={label}
        title={label}
        onClick={onClick}
      >
        {children}
      </button>
    </LexicalToolbarTooltip>
  );
}

function ToolbarDivider({ order }: { order: number }) {
  return <span aria-hidden="true" className={`tradezella-toolbar-divider tradezella-divider-${order}`} />;
}

function TagToolbarButton({
  tags,
  allTags,
  onTagsChange,
}: {
  tags: string[];
  allTags: string[];
  onTagsChange: (tags: string[]) => void;
}) {
  const locale = useLocale();
  const copy = COPY[locale];
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [newTag, setNewTag] = useState("");
  const visibleTags = allTags.filter((tag) => tag.toLowerCase().includes(query.trim().toLowerCase()));

  const toggleTag = (tag: string, checked: boolean) => {
    onTagsChange(checked ? [...tags, tag] : tags.filter((item) => item !== tag));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <LexicalToolbarTooltip label={copy.tag}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="toolbar-item toolbar-icon-button relative"
            aria-label={copy.tag}
            title={copy.tag}
          >
            <TradeZellaTagIcon className="size-4 fill-current" />
            {tags.length > 0 ? (
              <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary font-semibold text-[9px] text-primary-foreground">
                {tags.length}
              </span>
            ) : null}
          </button>
        </PopoverTrigger>
      </LexicalToolbarTooltip>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-64 p-2"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={copy.filterTags}
          className="mb-2 h-8"
        />
        <div className="max-h-52 overflow-y-auto">
          {visibleTags.length === 0 ? (
            <p className="px-2 py-3 text-center text-muted-foreground text-xs">{copy.noTags}</p>
          ) : (
            visibleTags.map((tag) => (
              <div key={tag} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                <Checkbox
                  aria-label={`${copy.tag} ${tag}`}
                  checked={tags.includes(tag)}
                  onCheckedChange={(checked) => toggleTag(tag, Boolean(checked))}
                />
                <span className="min-w-0 flex-1 truncate">{tag}</span>
              </div>
            ))
          )}
        </div>
        <Input
          value={newTag}
          onChange={(event) => setNewTag(event.target.value)}
          placeholder={copy.createTag}
          className="mt-2 h-8"
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            const tag = newTag.trim();
            if (!tag) return;
            if (!tags.includes(tag)) onTagsChange([...tags, tag]);
            setNewTag("");
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function LexicalToolbarButtons({
  templates,
  tags,
  allTags,
  onTagsChange,
  onHistory,
}: {
  templates: EditorTemplate[];
  tags: string[];
  allTags: string[];
  onTagsChange: (tags: string[]) => void;
  onHistory?: () => void;
}) {
  const [editor] = useLexicalComposerContext();
  const locale = useLocale();
  const copy = COPY[locale];
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const insertTemplate = (template: EditorTemplate) => {
    editor.update(() => {
      $getRoot().clear();
      $convertFromMarkdownString(template.markdown, TRANSFORMERS);
      editor.focus();
    });
  };

  const toggleVoice = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }
    const speechWindow = window as unknown as {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const SpeechRecognitionConstructor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognitionConstructor) {
      window.alert(copy.voiceUnsupported);
      return;
    }
    const recognition = new SpeechRecognitionConstructor();
    recognition.lang = locale === "zh-CN" ? "zh-CN" : "en-US";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) transcript += result[0].transcript;
      }
      if (!transcript.trim()) return;
      editor.update(() => {
        $insertNodes([$createTextNode(transcript)]);
        editor.focus();
      });
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
  };

  useEffect(() => () => recognitionRef.current?.stop(), []);

  return (
    <>
      <ToolbarIconButton label={copy.ai}>
        <Sparkles className="size-5 text-current" />
      </ToolbarIconButton>
      <ToolbarIconButton label={isListening ? copy.stopVoice : copy.voice} onClick={toggleVoice}>
        <TradeZellaSpeechIcon className="size-4 fill-current" />
      </ToolbarIconButton>
      <DropdownMenu>
        <LexicalToolbarTooltip label={copy.template}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="toolbar-item toolbar-icon-button"
              aria-label={copy.template}
              title={copy.template}
            >
              <TradeZellaTemplateIcon className="size-4 fill-current" />
            </button>
          </DropdownMenuTrigger>
        </LexicalToolbarTooltip>
        <DropdownMenuContent align="start" sideOffset={8} className="min-w-44">
          <DropdownMenuLabel>{copy.templates}</DropdownMenuLabel>
          {templates.length === 0 ? (
            <DropdownMenuItem disabled>{copy.noTemplates}</DropdownMenuItem>
          ) : (
            templates.map((template) => (
              <DropdownMenuItem key={template.id} onSelect={() => insertTemplate(template)}>
                {template.name}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ToolbarDivider order={4} />
      <TagToolbarButton tags={tags} allTags={allTags} onTagsChange={onTagsChange} />
      <ToolbarDivider order={11} />
      <LexicalTextStyleDropdown />
      <LexicalCodeLanguageDropdown />
      <LexicalFontSizeControl />
      <ToolbarDivider order={33} />
      <LexicalFormatDropdown />
      <LexicalLinkButton />
      <LexicalClearFormattingButton />
      <ToolbarDivider order={36} />
      <LexicalColorPickerButton kind="text" />
      <LexicalColorPickerButton kind="background" />
      <ToolbarDivider order={41} />
      <LexicalAlignmentDropdown />
      <ToolbarDivider order={42} />
      <LexicalInsertDropdown />
      <LexicalUndoRedoButtons />
      <ToolbarIconButton label={copy.history} onClick={onHistory}>
        <TradeZellaHistoryIcon className="size-4 fill-current" />
      </ToolbarIconButton>
      <ToolbarIconButton
        label={copy.fullscreen}
        onClick={() => document.querySelector(".lexical-editor-shell")?.requestFullscreen()}
      >
        <TradeZellaFullscreenIcon className="size-4 fill-current" />
      </ToolbarIconButton>
    </>
  );
}

export function LexicalEditorClient({
  editorId = "tradeez-editor",
  value,
  document,
  onChange,
  onChangeDocument,
  readOnly,
  templates = [],
  allTags = [],
  tags = [],
  onTagsChange,
  onHistory,
}: {
  editorId?: string;
  value: string;
  document?: SerializedDocument;
  onChange: (markdown: string) => void;
  onChangeDocument?: (document: SerializedDocument) => void;
  readOnly?: boolean;
  templates?: EditorTemplate[];
  allTags?: string[];
  tags?: string[];
  onTagsChange?: (tags: string[]) => void;
  onHistory?: () => void;
}) {
  const [initialDocument] = useState<SerializedDocument>(() => document ?? markdownToDocument(value));

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: The editor shell intentionally suppresses the browser context menu.
    <div
      className={`lexical-editor-shell ${readOnly ? "lexical-editor-readonly" : ""}`}
      onContextMenu={(event) => event.preventDefault()}
    >
      <ExtendableEditor
        collabDocId={editorId}
        name={editorId}
        namespace="TradeEZ"
        nodes={NOTEBOOK_NODES}
        theme={theme}
        features={{
          hasCodeBlocks: true,
          hasComments: false,
          hasEquations: true,
          hasLinkAttributes: true,
          hasSampleImage: true,
          hasSpeechToText: true,
          isCodeHighlighted: true,
          isCodeShiki: false,
          isPlaygroundMode: true,
          shouldShowActions: false,
          shouldUseLexicalContextMenu: false,
          showTableOfContents: false,
          showTreeView: false,
          tableCellBackgroundColor: true,
          tableCellMerge: true,
          tableHorizontalScroll: true,
        }}
        initialDocument={initialDocument}
        onChangeDocument={(nextDocument) => {
          onChangeDocument?.(nextDocument);
          onChange(documentToPlainText(nextDocument));
        }}
      >
        <div className="lexical-custom-toolbar-stack">
          <div className="toolbar lexical-custom-toolbar">
            <LexicalToolbarButtons
              templates={templates}
              tags={tags}
              allTags={allTags}
              onTagsChange={onTagsChange ?? (() => undefined)}
              onHistory={onHistory}
            />
          </div>
          {tags.length > 0 ? (
            <div className="lexical-custom-tag-strip">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                  {tag}
                  <button
                    type="button"
                    className="rounded-full p-0.5 hover:bg-background/60"
                    aria-label={`Remove tag ${tag}`}
                    onClick={() => onTagsChange?.(tags.filter((item) => item !== tag))}
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
        <LexicalToolbarLocalizer />
        <LexicalSlashCommandMenu />
        <LexicalFloatingToolbar />
      </ExtendableEditor>
    </div>
  );
}
