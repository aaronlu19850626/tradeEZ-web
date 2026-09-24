"use client";

import { useEffect, useMemo, useState } from "react";

import { Search } from "lucide-react";

import { DialogBody, DialogContent } from "@/components/dialogs/dialog-content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney } from "@/lib/format-numbers";
import { useLocale } from "@/lib/i18n";
import {
  MOCK_TRADE_CANDIDATES,
  type StrategyEvaluation,
  type StrategyEvaluationStatus,
  type StrategyLinkedTrade,
  type StrategyMock,
} from "@/lib/tradesync/strategy-center";
import { strategyCenterText } from "@/lib/tradesync/strategy-center-i18n";

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function StrategyTradeLinkDialog({
  open,
  onOpenChange,
  strategy,
  onLink,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  strategy: StrategyMock;
  onLink: (trades: StrategyLinkedTrade[]) => void;
}) {
  const locale = useLocale();
  const t = strategyCenterText[locale];
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected([]);
  }, [open]);

  const linkedIds = new Set(strategy.trades.map((trade) => trade.tradeId));
  const available = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return MOCK_TRADE_CANDIDATES.filter((trade) => {
      if (linkedIds.has(trade.tradeId)) return false;
      if (!normalized) return true;
      return `${trade.accountName} ${trade.symbol}`.toLowerCase().includes(normalized);
    });
  }, [linkedIds, query]);

  const submit = () => {
    const selectedSet = new Set(selected);
    const next = available
      .filter((trade) => selectedSet.has(trade.tradeId))
      .map<StrategyLinkedTrade>((trade) => ({
        ...trade,
        linkId: uid("link"),
        evaluation: null,
      }));
    onLink(next);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t.linkTrades}</DialogTitle>
          <DialogDescription>{t.mockNotice}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <InputGroup>
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.searchTrades}
            />
          </InputGroup>
          <div className="max-h-80 overflow-y-auto rounded-lg border">
            {available.length === 0 ? (
              <p className="p-6 text-center text-muted-foreground text-sm">{t.noAvailableTrades}</p>
            ) : (
              available.map((trade) => {
                const checked = selected.includes(trade.tradeId);
                return (
                  <Label
                    key={trade.tradeId}
                    className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 last:border-b-0 hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) =>
                        setSelected((current) =>
                          value === true ? [...current, trade.tradeId] : current.filter((id) => id !== trade.tradeId),
                        )
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {trade.symbol} · {trade.accountName}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {new Date(trade.closeTime * 1000).toLocaleString(locale)}
                      </p>
                    </div>
                    <Badge variant={trade.side === "buy" ? "success" : "danger"}>{trade.side.toUpperCase()}</Badge>
                    <span className="w-24 text-right font-medium tabular-nums">
                      {formatMoney(trade.netPnl, locale)}
                    </span>
                  </Label>
                );
              })
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.cancel}
          </Button>
          <Button disabled={selected.length === 0} onClick={submit}>
            {t.linkSelected}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function StrategyEvaluationDialog({
  open,
  onOpenChange,
  strategy,
  trade,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  strategy: StrategyMock;
  trade: StrategyLinkedTrade | null;
  onSave: (evaluation: StrategyEvaluation) => void;
}) {
  const locale = useLocale();
  const t = strategyCenterText[locale];
  const [answers, setAnswers] = useState<Record<string, { status: StrategyEvaluationStatus; evidence: string }>>({});

  useEffect(() => {
    if (!open || !trade) return;
    setAnswers(trade.evaluation?.answers ? structuredClone(trade.evaluation.answers) : {});
  }, [open, trade]);

  const rules = strategy.groups.flatMap((group) => group.rules.map((rule) => ({ ...rule, groupName: group.name })));

  const save = () => {
    if (!trade) return;
    const _answered = rules.filter((rule) => answers[rule.id]?.status);
    const complete = rules.every((rule) => {
      const status = answers[rule.id]?.status;
      return status === "pass" || status === "fail" || status === "na";
    });
    const scoreable = rules.filter(
      (rule) => answers[rule.id]?.status === "pass" || answers[rule.id]?.status === "fail",
    );
    const passed = scoreable.filter((rule) => answers[rule.id]?.status === "pass").length;
    onSave({
      linkId: trade.linkId,
      answers,
      complete,
      score: complete && scoreable.length > 0 ? (passed / scoreable.length) * 100 : null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t.evaluation}</DialogTitle>
          <DialogDescription>{trade ? `${trade.symbol} · ${trade.accountName}` : t.mockNotice}</DialogDescription>
        </DialogHeader>
        <DialogBody className="max-h-[calc(100dvh-13rem)] space-y-3">
          {rules.map((rule) => {
            const answer = answers[rule.id] ?? { status: "unknown", evidence: "" };
            return (
              <div key={rule.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{rule.name}</p>
                    <p className="text-muted-foreground text-xs">{rule.groupName}</p>
                  </div>
                  {rule.critical && <Badge variant="warning">{t.critical}</Badge>}
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-[10rem_1fr]">
                  <Select
                    value={answer.status}
                    onValueChange={(value) =>
                      setAnswers((current) => ({
                        ...current,
                        [rule.id]: { ...answer, status: value as StrategyEvaluationStatus },
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pass">{t.pass}</SelectItem>
                      <SelectItem value="fail">{t.fail}</SelectItem>
                      <SelectItem value="unknown">{t.unknown}</SelectItem>
                      <SelectItem value="na">{t.na}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={answer.evidence}
                    placeholder={t.evidence}
                    onChange={(event) =>
                      setAnswers((current) => ({
                        ...current,
                        [rule.id]: { ...answer, evidence: event.target.value },
                      }))
                    }
                  />
                </div>
              </div>
            );
          })}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.cancel}
          </Button>
          <Button onClick={save}>{t.saveEvaluation}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
