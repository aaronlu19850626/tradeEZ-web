// biome-ignore-all lint/security/noDangerouslySetInnerHtml: SVG markup is generated from the audited TradeZella registry.
import type { CSSProperties, HTMLAttributes } from "react";

import registry from "./icon-registry.json";
import "./tradezella-icon.css";

export type TradeZellaIconName = (typeof registry)[number]["name"];

type TradeZellaIconProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  name: TradeZellaIconName;
  size?: number | string;
  width?: number | string;
  height?: number | string;
};

const iconsByName = new Map(registry.map((icon) => [icon.name, icon]));

export function TradeZellaIcon({ name, size = 16, width, height, className, style, ...props }: TradeZellaIconProps) {
  const icon = iconsByName.get(name);
  if (!icon) return null;

  return (
    <span
      {...props}
      aria-hidden="true"
      className={["tradezella-icon", className].filter(Boolean).join(" ")}
      style={
        {
          ...style,
          width: width ?? size,
          height: height ?? size,
        } as CSSProperties
      }
      dangerouslySetInnerHTML={{ __html: icon.svg }}
    />
  );
}

export const TRADEZELLA_ICONS = registry;
