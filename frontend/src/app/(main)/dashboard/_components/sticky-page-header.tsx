"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

import { cn } from "cn";

export function StickyPageHeader({
  children,
  className,
  flush = false,
  showStuckBorder = true,
}: {
  children: ReactNode;
  className?: string;
  flush?: boolean;
  showStuckBorder?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const header = ref.current;
    if (!header) return;
    const scroller = header.closest<HTMLElement>('[data-slot="dashboard-workspace"]');
    const target: HTMLElement | Window = scroller ?? window;
    const stickyTop = scroller ? Number.parseFloat(window.getComputedStyle(scroller).paddingTop) || 0 : 0;

    const update = () => {
      const headerTop = header.getBoundingClientRect().top;
      const containerTop = scroller?.getBoundingClientRect().top ?? 0;
      const scrollOffset = scroller?.scrollTop ?? window.scrollY;
      setStuck(scrollOffset > 0 && headerTop <= containerTop + stickyTop + 1);
    };

    update();
    target.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      target.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const stuckBorderClassName = showStuckBorder ? "border-b border-foreground/35" : "border-b border-transparent";

  const headerClassName = cn(
    "relative sticky top-0 z-40 transition-[background-color,border-color] duration-150",
    flush
      ? "w-full"
      : "-mx-4 flex min-h-16 items-center px-4 md:-mx-6 md:min-h-20 md:px-6 lg:-mx-10 lg:px-10 xl:-mx-12 xl:px-12",
    stuck ? "bg-background" : "bg-transparent",
    stuck ? stuckBorderClassName : "border-b border-transparent",
    className,
  );

  if (flush) {
    return (
      <header ref={ref} className={headerClassName}>
        <div className="flex w-full flex-wrap items-center justify-between gap-4 px-10 py-5">{children}</div>
      </header>
    );
  }

  return (
    <header ref={ref} className={headerClassName}>
      {children}
    </header>
  );
}
