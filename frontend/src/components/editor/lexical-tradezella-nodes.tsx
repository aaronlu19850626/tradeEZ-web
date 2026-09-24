"use client";

import { type ReactNode, type PointerEvent as ReactPointerEvent, useEffect, useRef } from "react";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import katex from "katex";
import {
  $applyNodeReplacement,
  $getNodeByKey,
  DecoratorNode,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
} from "lexical";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  MoveDiagonal2,
  MoveHorizontal,
  MoveVertical,
  Scissors,
} from "lucide-react";

import { useLocale } from "@/lib/i18n";

import { TradeZellaTweetIcon } from "./lexical-tradezella-icons";

import "katex/dist/katex.min.css";

type ImageAlignment = "left" | "center" | "right" | "full";
type ImageCrop = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};
const EMPTY_IMAGE_CROP: ImageCrop = { bottom: 0, left: 0, right: 0, top: 0 };

type SerializedTradeZellaImageNode = SerializedLexicalNode & {
  type: "tradezella-inline-image";
  altText: string;
  alignment: ImageAlignment;
  caption: string;
  crop?: Partial<ImageCrop>;
  height?: number;
  inline: boolean;
  showCaption: boolean;
  src: string;
  width: number;
};

export class TradeZellaImageNode extends DecoratorNode<ReactNode> {
  __altText: string;
  __alignment: ImageAlignment;
  __caption: string;
  __crop: ImageCrop;
  __height?: number;
  __inline: boolean;
  __showCaption: boolean;
  __src: string;
  __width: number;

  static clone(node: TradeZellaImageNode) {
    return new TradeZellaImageNode(
      node.__src,
      node.__altText,
      node.__width,
      node.__height,
      node.__alignment,
      node.__caption,
      node.__crop,
      node.__inline,
      node.__showCaption,
      node.__key,
    );
  }

  static getType() {
    return "tradezella-inline-image";
  }

  static importJSON(serializedNode: SerializedTradeZellaImageNode) {
    return $createTradeZellaImageNode(serializedNode);
  }

  constructor(
    src: string,
    altText: string,
    width: number,
    height: number | undefined,
    alignment: ImageAlignment,
    caption: string,
    crop: ImageCrop,
    inline: boolean,
    showCaption: boolean,
    key?: NodeKey,
  ) {
    super(key);
    this.__src = src;
    this.__altText = altText;
    this.__width = width;
    this.__height = height;
    this.__alignment = alignment;
    this.__caption = caption;
    this.__crop = crop;
    this.__inline = inline;
    this.__showCaption = showCaption;
  }

  createDOM(_config: EditorConfig) {
    const span = document.createElement("span");
    span.className = this.__inline ? "tradezella-image-node is-inline" : "tradezella-image-node";
    span.dataset.imageAlignment = this.__alignment;
    if (!this.__inline) {
      span.style.display = "block";
      span.style.width = "100%";
    }
    return span;
  }

  updateDOM(prevNode: TradeZellaImageNode) {
    return (
      prevNode.__alignment !== this.__alignment ||
      prevNode.__altText !== this.__altText ||
      prevNode.__caption !== this.__caption ||
      prevNode.__crop !== this.__crop ||
      prevNode.__height !== this.__height ||
      prevNode.__inline !== this.__inline ||
      prevNode.__showCaption !== this.__showCaption ||
      prevNode.__src !== this.__src ||
      prevNode.__width !== this.__width
    );
  }

  exportJSON(): SerializedTradeZellaImageNode {
    return {
      ...super.exportJSON(),
      type: "tradezella-inline-image",
      altText: this.__altText,
      alignment: this.__alignment,
      caption: this.__caption,
      crop: this.__crop,
      height: this.__height,
      inline: this.__inline,
      showCaption: this.__showCaption,
      src: this.__src,
      width: this.__width,
    };
  }

  isInline() {
    return this.__inline;
  }

  getTextContent() {
    return this.__altText || "[image]";
  }

  getSrc() {
    return this.__src;
  }

  getAltText() {
    return this.__altText;
  }

  getWidth() {
    return this.__width;
  }

  getHeight() {
    return this.__height;
  }

  getAlignment() {
    return this.__alignment;
  }

  getCaption() {
    return this.__caption;
  }

  getCrop() {
    return this.__crop;
  }

  getShowCaption() {
    return this.__showCaption;
  }

  setWidth(width: number) {
    const writable = this.getWritable();
    writable.__width = Math.max(80, Math.min(1200, width));
  }

  setHeight(height: number | undefined) {
    const writable = this.getWritable();
    writable.__height = typeof height === "number" ? Math.max(60, Math.min(1200, height)) : undefined;
  }

  setAlignment(alignment: ImageAlignment) {
    const writable = this.getWritable();
    writable.__alignment = alignment;
  }

  setCaption(caption: string) {
    this.getWritable().__caption = caption;
  }

  setCrop(crop: ImageCrop) {
    const writable = this.getWritable();
    writable.__crop = {
      bottom: Math.max(0, Math.min(0.9, crop.bottom)),
      left: Math.max(0, Math.min(0.9, crop.left)),
      right: Math.max(0, Math.min(0.9, crop.right)),
      top: Math.max(0, Math.min(0.9, crop.top)),
    };
  }

  setShowCaption(showCaption: boolean) {
    this.getWritable().__showCaption = showCaption;
  }

  decorate() {
    return (
      <TradeZellaImageComponent
        alignment={this.__alignment}
        altText={this.__altText}
        caption={this.__caption}
        crop={this.__crop}
        height={this.__height}
        inline={this.__inline}
        nodeKey={this.getKey()}
        showCaption={this.__showCaption}
        src={this.__src}
        width={this.__width}
      />
    );
  }
}

export function $createTradeZellaImageNode({
  altText = "",
  alignment = "center",
  caption = "",
  crop = EMPTY_IMAGE_CROP,
  height,
  inline = false,
  showCaption = false,
  src,
  width = 420,
}: {
  altText?: string;
  alignment?: ImageAlignment;
  caption?: string;
  crop?: Partial<ImageCrop>;
  height?: number;
  inline?: boolean;
  showCaption?: boolean;
  src: string;
  width?: number;
}) {
  return $applyNodeReplacement(
    new TradeZellaImageNode(
      src,
      altText,
      width,
      height,
      alignment,
      caption,
      { ...EMPTY_IMAGE_CROP, ...crop },
      inline,
      showCaption,
    ),
  );
}

export function $isTradeZellaImageNode(node: LexicalNode | null | undefined): node is TradeZellaImageNode {
  return node instanceof TradeZellaImageNode;
}

function TradeZellaImageComponent({
  alignment,
  altText,
  caption,
  crop,
  height,
  inline,
  nodeKey,
  showCaption,
  src,
  width,
}: {
  alignment: ImageAlignment;
  altText: string;
  caption: string;
  crop: ImageCrop;
  height?: number;
  inline: boolean;
  nodeKey: NodeKey;
  showCaption: boolean;
  src: string;
  width: number;
}) {
  const [editor] = useLexicalComposerContext();
  const locale = useLocale();
  const rootRef = useRef<HTMLSpanElement>(null);
  const frameRef = useRef<HTMLSpanElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [editing, setEditing] = useLexicalNodeSelection(nodeKey);
  const resizeSizeRef = useRef({ height: height ?? 0, width });
  const cropRef = useRef<ImageCrop>(crop);
  const visibleWidthRatio = Math.max(0.1, 1 - crop.left - crop.right);
  const visibleHeightRatio = Math.max(0.1, 1 - crop.top - crop.bottom);

  useEffect(() => {
    if (!editing) return;
    const exitOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setEditing(false);
    };
    const exitOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEditing(false);
    };
    document.addEventListener("pointerdown", exitOnOutsidePointer, true);
    document.addEventListener("keydown", exitOnEscape);
    return () => {
      document.removeEventListener("pointerdown", exitOnOutsidePointer, true);
      document.removeEventListener("keydown", exitOnEscape);
    };
  }, [editing, setEditing]);

  const updateNode = (updater: (node: TradeZellaImageNode) => void) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isTradeZellaImageNode(node)) updater(node);
    });
  };

  let alignmentClass = "mx-auto";
  if (alignment === "left") alignmentClass = "mr-auto";
  if (alignment === "right") alignmentClass = "ml-auto";
  if (alignment === "full") alignmentClass = "w-full";
  let frameAlignment: "center" | "flex-end" | "flex-start" | "stretch" = "stretch";
  if (alignment === "left") frameAlignment = "flex-start";
  if (alignment === "center") frameAlignment = "center";
  if (alignment === "right") frameAlignment = "flex-end";

  const applyAlignment = (value: ImageAlignment) => {
    const frame = frameRef.current;
    const lexicalImageNode = frame?.closest<HTMLElement>(".tradezella-image-node");
    if (lexicalImageNode) {
      lexicalImageNode.dataset.imageAlignment = value;
      lexicalImageNode.style.display = "block";
      lexicalImageNode.style.width = "100%";
      if (value === "left") {
        lexicalImageNode.style.marginLeft = "0";
        lexicalImageNode.style.marginRight = "auto";
      } else if (value === "right") {
        lexicalImageNode.style.marginLeft = "auto";
        lexicalImageNode.style.marginRight = "0";
      } else if (value === "center") {
        lexicalImageNode.style.marginLeft = "auto";
        lexicalImageNode.style.marginRight = "auto";
      } else {
        lexicalImageNode.style.marginLeft = "0";
        lexicalImageNode.style.marginRight = "0";
      }
    }
    if (frame && value !== "full") {
      const editorRoot = frame.closest<HTMLElement>(".ContentEditable__root");
      const currentBounds = frame.getBoundingClientRect();
      const editorStyle = editorRoot ? window.getComputedStyle(editorRoot) : null;
      const contentWidth = editorRoot
        ? editorRoot.clientWidth -
          Number.parseFloat(editorStyle?.paddingLeft ?? "0") -
          Number.parseFloat(editorStyle?.paddingRight ?? "0")
        : currentBounds.width;
      if (currentBounds.width >= contentWidth - 1 && contentWidth > 80) {
        const nextWidth = contentWidth * 0.75;
        const nextHeight = currentBounds.height * (nextWidth / currentBounds.width);
        frame.style.width = `${nextWidth}px`;
        frame.style.height = `${nextHeight}px`;
        if (imageRef.current) imageRef.current.style.height = "100%";
        updateNode((node) => {
          node.setAlignment(value);
          node.setWidth(nextWidth / visibleWidthRatio);
          node.setHeight(nextHeight / visibleHeightRatio);
        });
        return;
      }
    }
    updateNode((node) => node.setAlignment(value));
  };

  const beginResize = (event: ReactPointerEvent<HTMLButtonElement>, mode: "corner" | "horizontal" | "vertical") => {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);

    const startX = event.clientX;
    const startY = event.clientY;
    const startBounds = frameRef.current?.getBoundingClientRect();
    const startVisibleWidth = startBounds?.width ?? width * visibleWidthRatio;
    const startVisibleHeight = startBounds?.height ?? (height ?? width) * visibleHeightRatio;
    const startWidth = startVisibleWidth / visibleWidthRatio;
    const startHeight = startVisibleHeight / visibleHeightRatio;
    const aspectRatio = startWidth / Math.max(1, startHeight);
    resizeSizeRef.current = { height: startHeight, width: startWidth };

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      let nextWidth = startWidth;
      let nextHeight = startHeight;

      if (mode === "horizontal") {
        const nextVisibleWidth = Math.max(80, startVisibleWidth + deltaX);
        nextWidth = nextVisibleWidth / visibleWidthRatio;
      }
      if (mode === "vertical") {
        const nextVisibleHeight = Math.max(60, startVisibleHeight + deltaY);
        nextHeight = nextVisibleHeight / visibleHeightRatio;
      }
      if (mode === "corner") {
        const dominantDelta = Math.abs(deltaX) >= Math.abs(deltaY) ? deltaX : deltaY * aspectRatio;
        const nextVisibleWidth = Math.max(80, startVisibleWidth + dominantDelta);
        nextWidth = nextVisibleWidth / visibleWidthRatio;
        nextHeight = nextWidth / aspectRatio;
      }

      nextWidth = Math.min(1200, nextWidth);
      nextHeight = Math.min(1200, nextHeight);

      resizeSizeRef.current = { height: nextHeight, width: nextWidth };
      if (frameRef.current) {
        frameRef.current.style.width = `${nextWidth * visibleWidthRatio}px`;
        frameRef.current.style.height = `${nextHeight * visibleHeightRatio}px`;
      }
      if (imageRef.current) imageRef.current.style.height = "100%";
    };

    const onPointerUp = () => {
      target.removeEventListener("pointermove", onPointerMove);
      target.removeEventListener("pointerup", onPointerUp);
      if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
      updateNode((node) => {
        if (node.getAlignment() === "full") node.setAlignment("center");
        node.setWidth(resizeSizeRef.current.width);
        node.setHeight(resizeSizeRef.current.height);
      });
    };

    target.addEventListener("pointermove", onPointerMove);
    target.addEventListener("pointerup", onPointerUp, { once: true });
  };

  const beginCrop = (event: ReactPointerEvent<HTMLButtonElement>, side: keyof ImageCrop) => {
    const frame = frameRef.current;
    if (!frame) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);

    const startX = event.clientX;
    const startY = event.clientY;
    const startBounds = frame.getBoundingClientRect();
    const startCrop = { ...crop };
    const fullWidth = startBounds.width / Math.max(0.1, 1 - startCrop.left - startCrop.right);
    const fullHeight = startBounds.height / Math.max(0.1, 1 - startCrop.top - startCrop.bottom);
    cropRef.current = startCrop;

    const renderPreview = (nextCrop: ImageCrop) => {
      const visibleWidth = Math.max(0.1, 1 - nextCrop.left - nextCrop.right);
      const visibleHeight = Math.max(0.1, 1 - nextCrop.top - nextCrop.bottom);
      frame.style.width = `${fullWidth * visibleWidth}px`;
      frame.style.height = `${fullHeight * visibleHeight}px`;
      const image = imageRef.current;
      if (image) {
        image.style.position = "absolute";
        image.style.width = `${100 / visibleWidth}%`;
        image.style.height = `${100 / visibleHeight}%`;
        image.style.left = `${(-nextCrop.left / visibleWidth) * 100}%`;
        image.style.top = `${(-nextCrop.top / visibleHeight) * 100}%`;
        image.style.maxWidth = "none";
      }
    };

    const onPointerMove = (moveEvent: PointerEvent) => {
      const nextCrop = { ...startCrop };
      if (side === "left") {
        nextCrop.left = Math.max(
          0,
          Math.min(0.9 - startCrop.right, startCrop.left + (moveEvent.clientX - startX) / fullWidth),
        );
      }
      if (side === "right") {
        nextCrop.right = Math.max(
          0,
          Math.min(0.9 - startCrop.left, startCrop.right - (moveEvent.clientX - startX) / fullWidth),
        );
      }
      if (side === "top") {
        nextCrop.top = Math.max(
          0,
          Math.min(0.9 - startCrop.bottom, startCrop.top + (moveEvent.clientY - startY) / fullHeight),
        );
      }
      if (side === "bottom") {
        nextCrop.bottom = Math.max(
          0,
          Math.min(0.9 - startCrop.top, startCrop.bottom - (moveEvent.clientY - startY) / fullHeight),
        );
      }
      cropRef.current = nextCrop;
      renderPreview(nextCrop);
    };

    const onPointerUp = () => {
      target.removeEventListener("pointermove", onPointerMove);
      target.removeEventListener("pointerup", onPointerUp);
      if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
      updateNode((node) => node.setCrop(cropRef.current));
    };

    target.addEventListener("pointermove", onPointerMove);
    target.addEventListener("pointerup", onPointerUp, { once: true });
  };

  const alignmentOptions = [
    { value: "left" as const, icon: AlignLeft, label: locale === "zh-CN" ? "图片左对齐" : "Align image left" },
    { value: "center" as const, icon: AlignCenter, label: locale === "zh-CN" ? "图片居中" : "Align image center" },
    { value: "right" as const, icon: AlignRight, label: locale === "zh-CN" ? "图片右对齐" : "Align image right" },
  ];
  const resizeHandles = [
    {
      mode: "horizontal" as const,
      className: "is-horizontal",
      icon: MoveHorizontal,
      label: locale === "zh-CN" ? "拖拽调整图片宽度" : "Drag to resize image width",
    },
    {
      mode: "vertical" as const,
      className: "is-vertical",
      icon: MoveVertical,
      label: locale === "zh-CN" ? "拖拽调整图片高度" : "Drag to resize image height",
    },
    {
      mode: "corner" as const,
      className: "is-corner",
      icon: MoveDiagonal2,
      label: locale === "zh-CN" ? "等比缩放图片" : "Scale image proportionally",
    },
  ];
  const cropHandles = [
    { side: "top" as const, icon: Scissors, label: locale === "zh-CN" ? "裁切图片顶部" : "Crop image top" },
    { side: "right" as const, icon: Scissors, label: locale === "zh-CN" ? "裁切图片右侧" : "Crop image right" },
    { side: "bottom" as const, icon: Scissors, label: locale === "zh-CN" ? "裁切图片底部" : "Crop image bottom" },
    { side: "left" as const, icon: Scissors, label: locale === "zh-CN" ? "裁切图片左侧" : "Crop image left" },
  ];
  const hasCrop = crop.top + crop.right + crop.bottom + crop.left > 0.0001;

  return (
    <span
      ref={rootRef}
      className={[
        "group/image relative max-w-full flex-col gap-1",
        editing ? "is-editing" : "",
        inline ? "inline-flex align-middle" : "my-2 flex w-full",
      ].join(" ")}
      data-tradezella-image={inline ? "inline" : "block"}
    >
      <span
        ref={frameRef}
        className={`tradezella-image-frame relative block max-w-full ${alignmentClass}`}
        style={{
          alignSelf: frameAlignment,
          height: height ? `${height * visibleHeightRatio}px` : "auto",
          width: alignment === "full" ? "100%" : width * visibleWidthRatio,
        }}
      >
        <span className={`tradezella-image-content ${hasCrop ? "is-cropped" : "is-intrinsic"}`}>
          {/* biome-ignore lint/performance/noImgElement: uploaded images are data URLs and need intrinsic sizing. */}
          <img
            src={src}
            alt={altText}
            ref={imageRef}
            className="block max-w-full object-fill"
            style={
              hasCrop
                ? {
                    height: `${100 / visibleHeightRatio}%`,
                    left: `${(-crop.left / visibleWidthRatio) * 100}%`,
                    maxWidth: "none",
                    position: "absolute",
                    top: `${(-crop.top / visibleHeightRatio) * 100}%`,
                    width: `${100 / visibleWidthRatio}%`,
                  }
                : { height: height ? "100%" : "auto", position: "relative", width: "100%" }
            }
            onLoad={(event) => {
              const renderedHeight = event.currentTarget.getBoundingClientRect().height;
              if (!height && renderedHeight > 1) {
                updateNode((node) => node.setHeight(renderedHeight / visibleHeightRatio));
              }
            }}
            draggable={false}
          />
        </span>
        {!editing ? (
          <button
            type="button"
            className="tradezella-image-edit-trigger"
            aria-label={locale === "zh-CN" ? "编辑图片" : "Edit image"}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setEditing(true);
            }}
          />
        ) : null}
        {editing ? (
          <>
            {resizeHandles.map(({ mode, className, icon: Icon, label }) => (
              <button
                key={mode}
                type="button"
                className={`tradezella-image-resize-handle ${className}`}
                aria-label={label}
                title={label}
                onPointerDown={(event) => beginResize(event, mode)}
              >
                <Icon aria-hidden="true" className="tradezella-image-resize-icon" />
              </button>
            ))}
            {cropHandles.map(({ side, icon: Icon, label }) => (
              <button
                key={side}
                type="button"
                className={`tradezella-image-crop-handle is-${side}`}
                aria-label={label}
                title={label}
                onPointerDown={(event) => beginCrop(event, side)}
              >
                <Icon aria-hidden="true" className="tradezella-image-crop-icon" />
              </button>
            ))}
            <span className="tradezella-image-toolbar absolute -top-10 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
              {alignmentOptions.map(({ value, icon: Icon, label }) => (
                <button
                  key={value}
                  type="button"
                  className={`size-7 rounded text-xs hover:bg-muted ${alignment === value ? "bg-muted" : ""}`}
                  aria-label={label}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    applyAlignment(value);
                  }}
                >
                  <Icon className="mx-auto size-4" />
                </button>
              ))}
            </span>
          </>
        ) : null}
      </span>
      {showCaption ? (
        <input
          value={caption}
          placeholder="Caption"
          className="w-full bg-transparent text-center text-muted-foreground text-xs outline-none"
          onChange={(event) => updateNode((node) => node.setCaption(event.target.value))}
        />
      ) : null}
    </span>
  );
}

type ToggleVariant = "toggle" | "h1" | "h2" | "h3" | "collapsible";

type SerializedTradeZellaToggleNode = SerializedLexicalNode & {
  type: "tradezella-toggle";
  content: string;
  open: boolean;
  title: string;
  variant: ToggleVariant;
};

export class TradeZellaToggleNode extends DecoratorNode<ReactNode> {
  __content: string;
  __open: boolean;
  __title: string;
  __variant: ToggleVariant;

  static clone(node: TradeZellaToggleNode) {
    return new TradeZellaToggleNode(node.__title, node.__content, node.__open, node.__variant, node.__key);
  }

  static getType() {
    return "tradezella-toggle";
  }

  static importJSON(serializedNode: SerializedTradeZellaToggleNode) {
    return $createTradeZellaToggleNode(serializedNode);
  }

  constructor(title: string, content: string, open: boolean, variant: ToggleVariant, key?: NodeKey) {
    super(key);
    this.__title = title;
    this.__content = content;
    this.__open = open;
    this.__variant = variant;
  }

  createDOM(_config: EditorConfig) {
    const div = document.createElement("div");
    div.className = "tradezella-toggle-node";
    return div;
  }

  updateDOM() {
    return false;
  }

  exportJSON(): SerializedTradeZellaToggleNode {
    return {
      ...super.exportJSON(),
      type: "tradezella-toggle",
      title: this.__title,
      content: this.__content,
      open: this.__open,
      variant: this.__variant,
    };
  }

  getContent() {
    return this.__content;
  }

  getOpen() {
    return this.__open;
  }

  getTitle() {
    return this.__title;
  }

  getVariant() {
    return this.__variant;
  }

  getTextContent() {
    return this.__open ? `${this.__title}\n${this.__content}` : this.__title;
  }

  setContent(content: string) {
    this.getWritable().__content = content;
  }

  setOpen(open: boolean) {
    this.getWritable().__open = open;
  }

  setTitle(title: string) {
    this.getWritable().__title = title;
  }

  decorate() {
    return (
      <TradeZellaToggleComponent
        content={this.__content}
        nodeKey={this.getKey()}
        open={this.__open}
        title={this.__title}
        variant={this.__variant}
      />
    );
  }
}

export function $createTradeZellaToggleNode({
  content = "",
  open = true,
  title = "",
  variant = "toggle",
}: {
  content?: string;
  open?: boolean;
  title?: string;
  variant?: ToggleVariant;
} = {}) {
  return $applyNodeReplacement(new TradeZellaToggleNode(title, content, open, variant));
}

export function $isTradeZellaToggleNode(node: LexicalNode | null | undefined): node is TradeZellaToggleNode {
  return node instanceof TradeZellaToggleNode;
}

function TradeZellaToggleComponent({
  content,
  nodeKey,
  open,
  title,
  variant,
}: {
  content: string;
  nodeKey: NodeKey;
  open: boolean;
  title: string;
  variant: ToggleVariant;
}) {
  const [editor] = useLexicalComposerContext();
  let headingClass = "text-sm font-medium";
  if (variant === "h1") headingClass = "text-2xl font-semibold";
  if (variant === "h2") headingClass = "text-xl font-semibold";
  if (variant === "h3") headingClass = "text-lg font-semibold";

  const updateNode = (updater: (node: TradeZellaToggleNode) => void) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isTradeZellaToggleNode(node)) updater(node);
    });
  };

  return (
    <div className="my-2 rounded-lg border bg-card/60">
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button
          type="button"
          className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={open ? "收起" : "展开"}
          onClick={() => updateNode((node) => node.setOpen(!node.getOpen()))}
        >
          <span className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
        </button>
        <input
          value={title}
          placeholder="Toggle"
          className={`min-w-0 flex-1 bg-transparent outline-none ${headingClass}`}
          onChange={(event) => updateNode((node) => node.setTitle(event.target.value))}
        />
      </div>
      {open ? (
        <textarea
          value={content}
          placeholder="输入内容"
          className="min-h-20 w-full resize-y border-t bg-transparent px-9 py-2 text-sm leading-6 outline-none"
          onChange={(event) => updateNode((node) => node.setContent(event.target.value))}
        />
      ) : null}
    </div>
  );
}

type TimedListItem = {
  id: string;
  text: string;
  time: string;
};

type SerializedTradeZellaTimedList = SerializedLexicalNode & {
  type: "tradezella-timed-list";
  items: TimedListItem[];
};

export class TradeZellaTimedListNode extends DecoratorNode<ReactNode> {
  __items: TimedListItem[];

  static clone(node: TradeZellaTimedListNode) {
    return new TradeZellaTimedListNode(node.__items, node.__key);
  }

  static getType() {
    return "tradezella-timed-list";
  }

  static importJSON(serializedNode: SerializedTradeZellaTimedList) {
    return $createTradeZellaTimedListNode(serializedNode.items);
  }

  constructor(items: TimedListItem[], key?: NodeKey) {
    super(key);
    this.__items = items;
  }

  createDOM(_config: EditorConfig) {
    const div = document.createElement("div");
    div.className = "tradezella-timed-list-node";
    return div;
  }

  updateDOM() {
    return false;
  }

  exportJSON(): SerializedTradeZellaTimedList {
    return {
      ...super.exportJSON(),
      type: "tradezella-timed-list",
      items: this.__items,
    };
  }

  getItems() {
    return this.__items;
  }

  getTextContent() {
    return this.__items.map((item) => `${item.time} ${item.text}`).join("\n");
  }

  setItems(items: TimedListItem[]) {
    this.getWritable().__items = items;
  }

  decorate() {
    return <TradeZellaTimedListComponent items={this.__items} nodeKey={this.getKey()} />;
  }
}

export function $createTradeZellaTimedListNode(items: TimedListItem[] = []) {
  return $applyNodeReplacement(new TradeZellaTimedListNode(items));
}

export function $isTradeZellaTimedListNode(node: LexicalNode | null | undefined): node is TradeZellaTimedListNode {
  return node instanceof TradeZellaTimedListNode;
}

function TradeZellaTimedListComponent({ items, nodeKey }: { items: TimedListItem[]; nodeKey: NodeKey }) {
  const [editor] = useLexicalComposerContext();

  const updateItems = (nextItems: TimedListItem[]) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isTradeZellaTimedListNode(node)) node.setItems(nextItems);
    });
  };

  const updateItem = (id: string, field: "text" | "time", value: string) => {
    updateItems(items.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  return (
    <div className="my-2 rounded-lg border bg-card/60 p-2">
      {items.map((item) => (
        <div key={item.id} className="grid grid-cols-[88px_1fr_28px] items-center gap-2 py-1">
          <input
            type="time"
            value={item.time}
            className="rounded border bg-background px-2 py-1 text-xs outline-none"
            onChange={(event) => updateItem(item.id, "time", event.target.value)}
          />
          <input
            value={item.text}
            placeholder="记录事项"
            className="min-w-0 bg-transparent text-sm outline-none"
            onChange={(event) => updateItem(item.id, "text", event.target.value)}
          />
          <button
            type="button"
            className="size-7 rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="删除时间项"
            onClick={() => updateItems(items.filter((candidate) => candidate.id !== item.id))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="mt-1 rounded px-2 py-1 text-muted-foreground text-xs hover:bg-muted hover:text-foreground"
        onClick={() =>
          updateItems([...items, { id: crypto.randomUUID(), time: new Date().toTimeString().slice(0, 5), text: "" }])
        }
      >
        + 添加时间项
      </button>
    </div>
  );
}

type SerializedTradeZellaEmbedNode = SerializedLexicalNode & {
  type: "tradezella-embed";
  kind: "tweet" | "youtube";
  url: string;
};

export class TradeZellaEmbedNode extends DecoratorNode<ReactNode> {
  __kind: "tweet" | "youtube";
  __url: string;

  static clone(node: TradeZellaEmbedNode) {
    return new TradeZellaEmbedNode(node.__kind, node.__url, node.__key);
  }

  static getType() {
    return "tradezella-embed";
  }

  static importJSON(serializedNode: SerializedTradeZellaEmbedNode) {
    return $createTradeZellaEmbedNode(serializedNode);
  }

  constructor(kind: "tweet" | "youtube", url: string, key?: NodeKey) {
    super(key);
    this.__kind = kind;
    this.__url = url;
  }

  createDOM(_config: EditorConfig) {
    const div = document.createElement("div");
    div.className = "tradezella-embed-node";
    return div;
  }

  updateDOM() {
    return false;
  }

  getTextContent() {
    return this.__url;
  }

  exportJSON(): SerializedTradeZellaEmbedNode {
    return {
      ...super.exportJSON(),
      type: "tradezella-embed",
      kind: this.__kind,
      url: this.__url,
    };
  }

  decorate() {
    return <TradeZellaEmbedComponent kind={this.__kind} url={this.__url} />;
  }
}

export function $createTradeZellaEmbedNode({ kind, url }: { kind: "tweet" | "youtube"; url: string }) {
  return $applyNodeReplacement(new TradeZellaEmbedNode(kind, url));
}

export function $isTradeZellaEmbedNode(node: LexicalNode | null | undefined): node is TradeZellaEmbedNode {
  return node instanceof TradeZellaEmbedNode;
}

function TradeZellaEmbedComponent({ kind, url }: { kind: "tweet" | "youtube"; url: string }) {
  if (kind === "youtube") {
    const videoId = getYouTubeId(url);
    return (
      <div className="my-2 aspect-video w-full overflow-hidden rounded-lg border bg-black">
        {videoId ? (
          <iframe
            className="h-full w-full"
            src={`https://www.youtube.com/embed/${videoId}`}
            title="YouTube video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-white">YouTube</div>
        )}
      </div>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="my-2 flex items-center gap-2 rounded-lg border bg-card/60 p-3 text-sm no-underline"
    >
      <TradeZellaTweetIcon className="size-4 fill-current" />
      <span className="min-w-0 truncate">X：{url}</span>
    </a>
  );
}

function getYouTubeId(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) return parsed.pathname.slice(1);
    return parsed.searchParams.get("v");
  } catch {
    return null;
  }
}

type SerializedTradeZellaPageBreakNode = SerializedLexicalNode & {
  type: "tradezella-page-break";
};

export class TradeZellaPageBreakNode extends DecoratorNode<ReactNode> {
  static clone(node: TradeZellaPageBreakNode) {
    return new TradeZellaPageBreakNode(node.__key);
  }

  static getType() {
    return "tradezella-page-break";
  }

  static importJSON() {
    return $createTradeZellaPageBreakNode();
  }

  createDOM(_config: EditorConfig) {
    const div = document.createElement("div");
    div.className = "tradezella-page-break-node";
    return div;
  }

  updateDOM() {
    return false;
  }

  exportJSON(): SerializedTradeZellaPageBreakNode {
    return {
      ...super.exportJSON(),
      type: "tradezella-page-break",
    };
  }

  decorate() {
    return (
      <div className="my-6 flex items-center gap-3 text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase tracking-wide">Page break</span>
        <span className="h-px flex-1 bg-border" />
      </div>
    );
  }
}

export function $createTradeZellaPageBreakNode() {
  return $applyNodeReplacement(new TradeZellaPageBreakNode());
}

export function $isTradeZellaPageBreakNode(node: LexicalNode | null | undefined): node is TradeZellaPageBreakNode {
  return node instanceof TradeZellaPageBreakNode;
}

type SerializedTradeZellaColumnsNode = SerializedLexicalNode & {
  type: "tradezella-columns";
  columns: number;
  values: string[];
};

export class TradeZellaColumnsNode extends DecoratorNode<ReactNode> {
  __columns: number;
  __values: string[];

  static clone(node: TradeZellaColumnsNode) {
    return new TradeZellaColumnsNode(node.__columns, node.__values, node.__key);
  }

  static getType() {
    return "tradezella-columns";
  }

  static importJSON(serializedNode: SerializedTradeZellaColumnsNode) {
    return $createTradeZellaColumnsNode(serializedNode.columns, serializedNode.values);
  }

  constructor(columns: number, values: string[], key?: NodeKey) {
    super(key);
    this.__columns = columns;
    this.__values = values;
  }

  createDOM(_config: EditorConfig) {
    const div = document.createElement("div");
    div.className = "tradezella-columns-node";
    return div;
  }

  updateDOM() {
    return false;
  }

  exportJSON(): SerializedTradeZellaColumnsNode {
    return {
      ...super.exportJSON(),
      type: "tradezella-columns",
      columns: this.__columns,
      values: this.__values,
    };
  }

  getColumns() {
    return this.__columns;
  }

  getValues() {
    return this.__values;
  }

  setValue(index: number, value: string) {
    const values = [...this.__values];
    values[index] = value;
    this.getWritable().__values = values;
  }

  decorate() {
    return <TradeZellaColumnsComponent columns={this.__columns} nodeKey={this.getKey()} values={this.__values} />;
  }
}

export function $createTradeZellaColumnsNode(columns = 2, values?: string[]) {
  return $applyNodeReplacement(new TradeZellaColumnsNode(columns, values ?? Array.from({ length: columns }, () => "")));
}

export function $isTradeZellaColumnsNode(node: LexicalNode | null | undefined): node is TradeZellaColumnsNode {
  return node instanceof TradeZellaColumnsNode;
}

function TradeZellaColumnsComponent({
  columns,
  nodeKey,
  values,
}: {
  columns: number;
  nodeKey: NodeKey;
  values: string[];
}) {
  const [editor] = useLexicalComposerContext();
  const updateValue = (index: number, value: string) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isTradeZellaColumnsNode(node)) node.setValue(index, value);
    });
  };

  return (
    <div
      className="my-3 grid gap-3 rounded-lg border bg-card/50 p-3"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: columns }, (_, index) => (
        <textarea
          key={`${columns}-${index}`}
          value={values[index] ?? ""}
          placeholder={`Column ${index + 1}`}
          className="min-h-24 resize-y rounded border bg-background p-2 text-sm outline-none"
          onChange={(event) => updateValue(index, event.target.value)}
        />
      ))}
    </div>
  );
}

type SerializedTradeZellaEquationNode = SerializedLexicalNode & {
  type: "tradezella-equation";
  formula: string;
  inline: boolean;
};

export class TradeZellaEquationNode extends DecoratorNode<ReactNode> {
  __formula: string;
  __inline: boolean;

  static clone(node: TradeZellaEquationNode) {
    return new TradeZellaEquationNode(node.__formula, node.__inline, node.__key);
  }

  static getType() {
    return "tradezella-equation";
  }

  static importJSON(serializedNode: SerializedTradeZellaEquationNode) {
    return $createTradeZellaEquationNode(serializedNode.formula, serializedNode.inline);
  }

  constructor(formula: string, inline: boolean, key?: NodeKey) {
    super(key);
    this.__formula = formula;
    this.__inline = inline;
  }

  createDOM(_config: EditorConfig) {
    const span = document.createElement("span");
    span.className = "tradezella-equation-node";
    return span;
  }

  updateDOM() {
    return false;
  }

  exportJSON(): SerializedTradeZellaEquationNode {
    return {
      ...super.exportJSON(),
      type: "tradezella-equation",
      formula: this.__formula,
      inline: this.__inline,
    };
  }

  isInline() {
    return this.__inline;
  }

  getTextContent() {
    return this.__formula;
  }

  decorate() {
    let html = "";
    try {
      html = katex.renderToString(this.__formula || "\\text{Equation}", {
        throwOnError: false,
        displayMode: !this.__inline,
      });
    } catch {
      html = this.__formula;
    }
    return (
      <span
        className={this.__inline ? "inline-block px-1" : "my-3 block text-center"}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: KaTeX output is generated locally from user-entered formulas.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
}

export function $createTradeZellaEquationNode(formula: string, inline = false) {
  return $applyNodeReplacement(new TradeZellaEquationNode(formula, inline));
}

export function $isTradeZellaEquationNode(node: LexicalNode | null | undefined): node is TradeZellaEquationNode {
  return node instanceof TradeZellaEquationNode;
}

export const TRADEZELLA_NOTEBOOK_NODES = [
  TradeZellaImageNode,
  TradeZellaToggleNode,
  TradeZellaTimedListNode,
  TradeZellaEmbedNode,
  TradeZellaPageBreakNode,
  TradeZellaColumnsNode,
  TradeZellaEquationNode,
];
