import { cn } from "cn";

export function LoadingWave({
  title,
  description,
  compact = false,
  className,
}: {
  title?: string;
  description?: string;
  compact?: boolean;
  className?: string;
}) {
  const bars = compact ? [0, 1, 2, 3] : [0, 1, 2, 3, 4];
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center",
        compact ? "gap-3 text-sm text-muted-foreground" : "gap-6 py-24",
        className,
      )}
    >
      <div
        data-slot="loading-wave"
        className={cn("flex items-center", compact ? "h-10 gap-1.5" : "h-16 gap-2")}
        aria-hidden
      >
        {bars.map((index) => (
          <span
            key={index}
            className={cn("tradeez-loading-bar rounded-full bg-primary", compact ? "h-10 w-2" : "h-16 w-3")}
            style={{ animationDelay: `${(-index * 1.45) / bars.length}s` }}
          />
        ))}
      </div>
      {title ? <p className={compact ? undefined : "font-semibold text-xl"}>{title}</p> : null}
      {description ? (
        <p className={compact ? undefined : "mt-1.5 text-sm text-muted-foreground"}>{description}</p>
      ) : null}
    </div>
  );
}
