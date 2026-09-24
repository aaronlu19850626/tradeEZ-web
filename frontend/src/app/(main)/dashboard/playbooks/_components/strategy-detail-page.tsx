"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { ArrowLeft, Copy, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney, formatMoneyStat, formatPercent } from "@/lib/format-numbers";
import { useLocale } from "@/lib/i18n";
import {
  duplicateStrategy,
  readMockStrategies,
  ruleStats,
  type StrategyEvaluation,
  type StrategyLinkedTrade,
  type StrategyMock,
  strategyMetrics,
  writeMockStrategies,
} from "@/lib/tradesync/strategy-center";
import { strategyCenterText } from "@/lib/tradesync/strategy-center-i18n";
import { STRATEGY_TAG_CATEGORIES, strategyTagLabel } from "@/lib/tradesync/strategy-tags";

import { StrategyEditorDialog, type StrategyEditorDraft } from "./strategy-editor-dialog";
import { StrategyEvaluationDialog, StrategyTradeLinkDialog } from "./strategy-trade-dialogs";

function formatDuration(seconds: number | null, locale: string) {
  if (seconds === null) return "--";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours.toLocaleString(locale)}h ${minutes.toLocaleString(locale)}m`;
  return `${minutes.toLocaleString(locale)}m`;
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <Card className="gap-0 py-4">
      <CardContent className="space-y-1 px-4">
        <p className="font-medium text-muted-foreground text-xs">{label}</p>
        <p className="font-semibold text-xl tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

export function StrategyDetailPage({ strategyId }: { strategyId: string }) {
  const locale = useLocale();
  const t = strategyCenterText[locale];
  const router = useRouter();
  const [strategies, setStrategies] = useState<StrategyMock[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [evaluationTrade, setEvaluationTrade] = useState<StrategyLinkedTrade | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const next = readMockStrategies();
    setStrategies(next);
    setLoaded(true);
  }, []);

  const strategy = strategies.find((item) => item.id === strategyId);

  useEffect(() => {
    setNotes(strategy?.notes ?? "");
  }, [strategy?.notes]);

  const persist = (next: StrategyMock[]) => {
    setStrategies(next);
    writeMockStrategies(next);
  };

  if (!loaded) {
    return <div className="min-h-80 animate-pulse rounded-lg bg-muted/30" />;
  }

  if (!strategy) {
    return (
      <Card>
        <CardContent className="flex min-h-72 flex-col items-center justify-center gap-3 text-center">
          <p className="font-semibold">{t.strategyNotFound}</p>
          <p className="max-w-md text-muted-foreground text-sm">{t.strategyNotFoundDescription}</p>
          <Button asChild variant="outline">
            <Link href="/dashboard/playbooks">{t.backToList}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const metrics = strategyMetrics(strategy);
  const stats = ruleStats(strategy);
  const saveDraft = (draft: StrategyEditorDraft) => {
    persist(
      strategies.map((item) =>
        item.id === strategy.id
          ? (() => {
              const now = new Date().toISOString();
              const draftVersion = item.draftVersion ?? item.publishedVersion + 1;
              const versions = item.versions.some((version) => version.version === draftVersion)
                ? item.versions.map((version) =>
                    version.version === draftVersion
                      ? { ...version, status: "draft" as const, publishedAt: null }
                      : version,
                  )
                : [
                    ...item.versions,
                    {
                      version: draftVersion,
                      status: "draft" as const,
                      createdAt: now,
                      publishedAt: null,
                    },
                  ];
              return { ...item, ...draft, draftVersion, versions, updatedAt: now };
            })()
          : item,
      ),
    );
    toast.success(t.strategySaved);
  };

  const publishDraft = () => {
    if (!strategy.draftVersion) return;
    const now = new Date().toISOString();
    persist(
      strategies.map((item) =>
        item.id === strategy.id
          ? {
              ...item,
              publishedVersion: item.draftVersion ?? item.publishedVersion,
              draftVersion: null,
              versions: item.versions.map((version) =>
                version.version === item.draftVersion
                  ? { ...version, status: "published" as const, publishedAt: now }
                  : version,
              ),
              updatedAt: now,
            }
          : item,
      ),
    );
    toast.success(t.publishStrategy);
  };

  const updateTradeEvaluation = (trade: StrategyLinkedTrade, evaluation: StrategyEvaluation) => {
    persist(
      strategies.map((item) =>
        item.id === strategy.id
          ? {
              ...item,
              trades: item.trades.map((current) =>
                current.linkId === trade.linkId ? { ...current, evaluation } : current,
              ),
            }
          : item,
      ),
    );
    toast.success(t.evaluationSaved);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Button asChild variant="ghost" size="icon-sm" aria-label={t.backToList}>
            <Link href="/dashboard/playbooks">
              <ArrowLeft />
            </Link>
          </Button>
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-lg font-semibold text-sm text-white"
            style={{ backgroundColor: strategy.color }}
          >
            {strategy.icon || "ST"}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate font-semibold text-2xl tracking-tight">{strategy.name}</h1>
              <Badge variant={strategy.status === "active" ? "success" : "secondary"}>
                {strategy.status === "active" ? t.active : t.archived}
              </Badge>
            </div>
            <p className="mt-1 max-w-3xl text-muted-foreground text-sm">{strategy.description || t.mockNotice}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                {t.publishedVersion} v{strategy.publishedVersion}
              </Badge>
              {strategy.draftVersion && (
                <>
                  <Badge variant="warning">
                    {t.draftVersion} v{strategy.draftVersion}
                  </Badge>
                  <Button size="sm" onClick={publishDraft}>
                    {t.publish}
                  </Button>
                </>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    {t.versionHistory}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {[...strategy.versions].reverse().map((version) => (
                    <DropdownMenuItem key={version.version} disabled>
                      <span>v{version.version}</span>
                      <Badge variant={version.status === "published" ? "success" : "warning"}>
                        {version.status === "published" ? t.published : t.draft}
                      </Badge>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="mt-3 grid gap-1.5 text-xs">
              {STRATEGY_TAG_CATEGORIES.map((category) => (
                <div key={category.id} className="flex flex-wrap items-center gap-1.5">
                  <span className="min-w-20 text-muted-foreground">{category.labels[locale]}</span>
                  {strategy.tags[category.id].length > 0 ? (
                    strategy.tags[category.id].map((tagId) => (
                      <Badge key={tagId} variant="outline">
                        {strategyTagLabel(category.id, tagId, locale)}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-muted-foreground">--</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setEditorOpen(true)}>
            <Pencil />
            {t.edit}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label={t.actions}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
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
                        ? { ...item, status: item.status === "active" ? "archived" : "active" }
                        : item,
                    ),
                  );
                  toast.success(strategy.status === "active" ? t.strategyArchived : t.strategyRestored);
                }}
              >
                {strategy.status === "active" ? t.archive : t.restore}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 />
                {t.delete}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <DetailMetric label={t.winRate} value={formatPercent(metrics.winRate, locale, 1)} />
        <DetailMetric label={t.tradeCount} value={metrics.trades.toLocaleString(locale)} />
        <DetailMetric
          label={t.profitFactor}
          value={metrics.profitFactor === null ? "--" : metrics.profitFactor.toFixed(2)}
        />
        <DetailMetric label={t.dailyWinRate} value={formatPercent(metrics.dailyWinRate, locale, 1)} />
        <DetailMetric label={t.avgDuration} value={formatDuration(metrics.averageDurationSec, locale)} />
        <DetailMetric label={t.winLoss} value={`${metrics.winners} / ${metrics.losers}`} />
      </div>

      <Tabs defaultValue="stats" className="gap-4">
        <TabsList variant="line">
          <TabsTrigger value="stats">{t.stats}</TabsTrigger>
          <TabsTrigger value="rules">{t.rules}</TabsTrigger>
          <TabsTrigger value="trades">{t.trades}</TabsTrigger>
          <TabsTrigger value="notes">{t.notes}</TabsTrigger>
        </TabsList>

        <TabsContent value="stats">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>{t.linkedTrades}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.strategyName}</TableHead>
                      <TableHead className="text-right">{t.totalNetPnl}</TableHead>
                      <TableHead className="text-right">{t.winRate}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {strategy.trades.slice(0, 8).map((trade) => (
                      <TableRow key={trade.linkId}>
                        <TableCell>
                          <p className="font-medium">{trade.symbol}</p>
                          <p className="text-muted-foreground text-xs">{trade.accountName}</p>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(trade.netPnl, locale)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {trade.netPnl > 0 ? "100.0%" : "0.0%"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {strategy.trades.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                          {t.noTrades}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>
                  {t.averageWinner} / {t.averageLoser}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t.averageWinner}</span>
                  <span className="font-medium tabular-nums">
                    {metrics.averageWinner === null ? "--" : formatMoneyStat(metrics.averageWinner, locale)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t.averageLoser}</span>
                  <span className="font-medium tabular-nums">
                    {metrics.averageLoser === null ? "--" : formatMoneyStat(metrics.averageLoser, locale)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t.expectancy}</span>
                  <span className="font-medium tabular-nums">{formatMoneyStat(metrics.expectancy, locale)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="rules">
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setEditorOpen(true)}>
                <Pencil />
                {t.edit}
              </Button>
            </div>
            {strategy.groups.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center text-muted-foreground">{t.noRules}</CardContent>
              </Card>
            ) : (
              strategy.groups.map((group) => (
                <Card key={group.id} className="overflow-hidden p-0">
                  <CardHeader className="border-b px-4 py-3">
                    <CardTitle className="text-base">{group.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t.ruleName}</TableHead>
                          <TableHead>{t.followRate}</TableHead>
                          <TableHead className="text-right">{t.totalNetPnl}</TableHead>
                          <TableHead className="text-right">{t.profitFactor}</TableHead>
                          <TableHead className="text-right">{t.winRate}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.rules.map((rule) => {
                          const stat = stats[rule.id];
                          return (
                            <TableRow key={rule.id}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span>{rule.name}</span>
                                  {rule.critical && <Badge variant="warning">{t.critical}</Badge>}
                                </div>
                              </TableCell>
                              <TableCell className="tabular-nums">
                                {formatPercent(stat?.followRate ?? 0, locale, 0)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatMoney(stat?.netPnl ?? 0, locale)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {stat?.profitFactor === null || stat?.profitFactor === undefined
                                  ? "N/A"
                                  : stat.profitFactor.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatPercent(stat.winRate, locale, 0)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="trades">
          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between border-b p-4">
              <CardTitle>{t.linkedTrades}</CardTitle>
              <Button onClick={() => setLinkOpen(true)}>
                <Plus />
                {t.linkTrades}
              </Button>
            </div>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.strategyName}</TableHead>
                    <TableHead>{t.evaluation}</TableHead>
                    <TableHead>{t.evidence}</TableHead>
                    <TableHead className="text-right">{t.totalNetPnl}</TableHead>
                    <TableHead className="w-48" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {strategy.trades.map((trade) => (
                    <TableRow key={trade.linkId}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Badge variant={trade.side === "buy" ? "success" : "danger"}>
                            {trade.side.toUpperCase()}
                          </Badge>
                          <div>
                            <p className="font-medium">{trade.symbol}</p>
                            <p className="text-muted-foreground text-xs">{trade.accountName}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {trade.evaluation ? (
                          <Badge variant="success">{t.evaluatedStatus}</Badge>
                        ) : (
                          <Badge variant="outline">{t.pendingEvaluation}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {trade.evaluation
                          ? Object.values(trade.evaluation.answers).filter((answer) => answer.evidence).length
                          : 0}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatMoney(trade.netPnl, locale)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => setEvaluationTrade(trade)}>
                            {t.evaluation}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              persist(
                                strategies.map((item) =>
                                  item.id === strategy.id
                                    ? {
                                        ...item,
                                        trades: item.trades.filter((current) => current.linkId !== trade.linkId),
                                      }
                                    : item,
                                ),
                              );
                              toast.success(t.tradeUnlinked);
                            }}
                          >
                            {t.unlink}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {strategy.trades.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <div className="flex min-h-56 flex-col items-center justify-center gap-2 text-center">
                          <p className="font-medium">{t.noTrades}</p>
                          <p className="text-muted-foreground text-sm">{t.noTradesDescription}</p>
                          <Button variant="outline" onClick={() => setLinkOpen(true)}>
                            <Plus />
                            {t.linkTrades}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes">
          <Card>
            <CardHeader>
              <CardTitle>{t.notes}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder={t.notesPlaceholder}
                className="min-h-72"
              />
              <div className="flex justify-end">
                <Button
                  onClick={() => {
                    persist(
                      strategies.map((item) =>
                        item.id === strategy.id ? { ...item, notes, updatedAt: new Date().toISOString() } : item,
                      ),
                    );
                    toast.success(t.notesSaved);
                  }}
                >
                  {t.saveNotes}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <StrategyEditorDialog open={editorOpen} onOpenChange={setEditorOpen} strategy={strategy} onSave={saveDraft} />

      <StrategyTradeLinkDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        strategy={strategy}
        onLink={(trades) => {
          persist(
            strategies.map((item) =>
              item.id === strategy.id ? { ...item, trades: [...trades, ...item.trades] } : item,
            ),
          );
          toast.success(t.tradeLinked);
        }}
      />

      <StrategyEvaluationDialog
        open={Boolean(evaluationTrade)}
        onOpenChange={(open) => !open && setEvaluationTrade(null)}
        strategy={strategy}
        trade={evaluationTrade}
        onSave={(evaluation) => {
          if (evaluationTrade) updateTradeEvaluation(evaluationTrade, evaluation);
          setEvaluationTrade(null);
        }}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
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
                persist(strategies.filter((item) => item.id !== strategy.id));
                toast.success(t.strategyDeleted);
                router.push("/dashboard/playbooks");
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
