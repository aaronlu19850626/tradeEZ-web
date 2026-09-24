"use client";

import { useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { Copy, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoneyStat, formatPercent } from "@/lib/format-numbers";
import { useLocale } from "@/lib/i18n";
import {
  createStrategyFromDraft,
  duplicateStrategy,
  readMockStrategies,
  type StrategyMock,
  type StrategyStatus,
  strategyMetrics,
  writeMockStrategies,
} from "@/lib/tradesync/strategy-center";
import { strategyCenterText } from "@/lib/tradesync/strategy-center-i18n";
import { strategyTagLabel } from "@/lib/tradesync/strategy-tags";

import { StrategyEditorDialog, type StrategyEditorDraft } from "./strategy-editor-dialog";

function metricValue(value: number | null, locale: string, suffix = "") {
  if (value === null) return "--";
  return `${value.toLocaleString(locale, { maximumFractionDigits: 2 })}${suffix}`;
}

export function StrategyListPage() {
  const locale = useLocale();
  const t = strategyCenterText[locale];
  const router = useRouter();
  const [strategies, setStrategies] = useState<StrategyMock[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<StrategyStatus>("active");
  const [query, setQuery] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<StrategyMock | null>(null);
  const [deleting, setDeleting] = useState<StrategyMock | null>(null);

  useEffect(() => {
    setStrategies(readMockStrategies());
    setLoaded(true);
  }, []);

  const persist = (next: StrategyMock[]) => {
    setStrategies(next);
    writeMockStrategies(next);
  };

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return strategies.filter((strategy) => {
      if (strategy.status !== status) return false;
      if (!normalized) return true;
      return strategy.name.toLowerCase().includes(normalized);
    });
  }, [query, status, strategies]);

  const saveStrategy = (draft: StrategyEditorDraft) => {
    if (editing) {
      persist(
        strategies.map((strategy) =>
          strategy.id === editing.id
            ? (() => {
                const now = new Date().toISOString();
                const draftVersion = strategy.draftVersion ?? strategy.publishedVersion + 1;
                const versions = strategy.versions.some((item) => item.version === draftVersion)
                  ? strategy.versions.map((item) =>
                      item.version === draftVersion ? { ...item, status: "draft" as const, publishedAt: null } : item,
                    )
                  : [
                      ...strategy.versions,
                      {
                        version: draftVersion,
                        status: "draft" as const,
                        createdAt: now,
                        publishedAt: null,
                      },
                    ];
                return {
                  ...strategy,
                  ...draft,
                  draftVersion,
                  versions,
                  updatedAt: now,
                };
              })()
            : strategy,
        ),
      );
    } else {
      persist([createStrategyFromDraft({ ...draft, status: "active" }), ...strategies]);
    }
    toast.success(t.strategySaved);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-semibold text-2xl tracking-tight">{t.listTitle}</h1>
          <p className="text-muted-foreground text-sm">{t.listDescription}</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setEditorOpen(true);
          }}
        >
          <Plus />
          {t.createStrategy}
        </Button>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <Tabs value={status} onValueChange={(value) => setStatus(value as StrategyStatus)}>
            <TabsList variant="line">
              <TabsTrigger value="active">{t.active}</TabsTrigger>
              <TabsTrigger value="archived">{t.archived}</TabsTrigger>
            </TabsList>
          </Tabs>
          <InputGroup className="w-full sm:w-72">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.searchPlaceholder}
            />
          </InputGroup>
        </div>

        {loaded && visible.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center gap-2 p-8 text-center">
            <p className="font-medium">{t.noStrategies}</p>
            <p className="max-w-md text-muted-foreground text-sm">{t.noStrategiesDescription}</p>
            {status === "active" && (
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(null);
                  setEditorOpen(true);
                }}
              >
                <Plus />
                {t.createStrategy}
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.strategyName}</TableHead>
                <TableHead className="text-right">{t.sharedStrategies}</TableHead>
                <TableHead className="text-right">{t.averageLoser}</TableHead>
                <TableHead className="text-right">{t.averageWinner}</TableHead>
                <TableHead className="text-right">{t.totalNetPnl}</TableHead>
                <TableHead className="text-right">{t.profitFactor}</TableHead>
                <TableHead className="text-right">{t.tradeCount}</TableHead>
                <TableHead className="text-right">{t.expectancy}</TableHead>
                <TableHead className="text-right">{t.winRate}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((strategy) => {
                const metrics = strategyMetrics(strategy);
                return (
                  <TableRow
                    key={strategy.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/dashboard/playbooks/${strategy.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span
                          className="flex size-8 items-center justify-center rounded-md font-semibold text-white text-xs"
                          style={{ backgroundColor: strategy.color }}
                        >
                          {strategy.icon || "ST"}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{strategy.name}</p>
                          <p className="truncate text-muted-foreground text-xs">
                            {strategy.description || t.mockNotice}
                          </p>
                          <div className="mt-1 flex gap-1 overflow-hidden">
                            {strategy.tags.technicalDirections.slice(0, 2).map((tagId) => (
                              <Badge key={tagId} variant="outline">
                                {strategyTagLabel("technicalDirections", tagId, locale)}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">--</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {metrics.averageLoser === null ? "--" : formatMoneyStat(metrics.averageLoser, locale)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {metrics.averageWinner === null ? "--" : formatMoneyStat(metrics.averageWinner, locale)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoneyStat(metrics.netPnl, locale)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {metricValue(metrics.profitFactor, locale)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{metrics.trades}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoneyStat(metrics.expectancy, locale)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPercent(metrics.winRate, locale, 1)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t.actions}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setEditing(strategy);
                              setEditorOpen(true);
                            }}
                          >
                            <Pencil />
                            {t.edit}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              persist([
                                duplicateStrategy(
                                  strategy,
                                  strategies.map((item) => item.name),
                                ),
                                ...strategies,
                              ]);
                              toast.success(t.strategyDuplicated);
                            }}
                          >
                            <Copy />
                            {t.duplicate}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              persist(
                                strategies.map((item) =>
                                  item.id === strategy.id
                                    ? {
                                        ...item,
                                        status: item.status === "active" ? "archived" : "active",
                                      }
                                    : item,
                                ),
                              );
                              toast.success(strategy.status === "active" ? t.strategyArchived : t.strategyRestored);
                            }}
                          >
                            <Badge variant="outline">{strategy.status === "active" ? t.archive : t.restore}</Badge>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onClick={() => setDeleting(strategy)}>
                            <Trash2 />
                            {t.delete}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <StrategyEditorDialog open={editorOpen} onOpenChange={setEditorOpen} strategy={editing} onSave={saveStrategy} />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.deleteDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!deleting) return;
                persist(strategies.filter((strategy) => strategy.id !== deleting.id));
                toast.success(t.strategyDeleted);
                setDeleting(null);
              }}
            >
              {t.confirmDelete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
