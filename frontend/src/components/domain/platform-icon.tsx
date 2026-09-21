import Image from "next/image";

import { cn } from "cn";

import { findPlatform } from "@/lib/tradesync/platforms";

export function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
  const item = findPlatform(platform);
  return (
    <Image
      src={item.icon}
      alt={item.label}
      width={24}
      height={24}
      draggable={false}
      unoptimized
      className={cn("size-5 shrink-0 object-contain", className)}
    />
  );
}
