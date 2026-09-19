"use client";

import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { api, type TradeReconciliation } from "@/lib/tradesync/api";

const resultNames: Record<string, string> = {
  source_confirmed: "确认EA原始数据无误",
  awaiting_resync: "等待EA补传后重新核对",
  not_a_trade: "确认不是有效交易",
};

export function TradeReconciliationEditor({ tradeId, needsReview, onSaved }: {
  tradeId: number;
  needsReview: boolean;
  onSaved?: () => void;
}) {
  const [data, setData] = useState<TradeReconciliation | null>(null);
  const [state, setState] = useState<TradeReconciliation["state"]>("open");
  const [resolution, setResolution] = useState<TradeReconciliation["resolution"]>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.tradeReconciliation(tradeId).then((item) => {
      setData(item);
      setState(item.state);
      setResolution(item.resolution);
      setNote(item.note);
    }).catch((error) => setMessage(error instanceof Error ? error.message : "核对记录加载失败"));
  }, [tradeId]);

  async function save() {
    if (note.trim().length < 3) {
      setMessage("请填写至少 3 个字符的核对说明");
      return;
    }
    if (state === "resolved" && !resolution) {
      setMessage("请选择处理结论");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const result = await api.saveTradeReconciliation(tradeId, { state, resolution, note: note.trim() });
      setData(result);
      setMessage("核对记录已保存");
      onSaved?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (!needsReview && !data?.updated_at) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>异常订单处理</CardTitle>
          <Badge variant={state === "resolved" ? "secondary" : "destructive"}>
            {state === "resolved" ? "已处理" : state === "investigating" ? "核对中" : "待处理"}
          </Badge>
        </div>
        <CardDescription>记录人工核对过程。处理结论不会改写EA上传的原始成交。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Field>
          <FieldLabel htmlFor="reconciliation-state">处理状态</FieldLabel>
          <NativeSelect id="reconciliation-state" value={state} onChange={(event) => {
            const value = event.target.value as TradeReconciliation["state"];
            setState(value);
            if (value !== "resolved") setResolution(value === "investigating" ? "awaiting_resync" : null);
          }}>
            <NativeSelectOption value="open">待处理</NativeSelectOption>
            <NativeSelectOption value="investigating">核对中</NativeSelectOption>
            <NativeSelectOption value="resolved">已处理</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="reconciliation-result">处理结论</FieldLabel>
          <NativeSelect id="reconciliation-result" value={resolution ?? ""} onChange={(event) => setResolution((event.target.value || null) as TradeReconciliation["resolution"])}>
            <NativeSelectOption value="">请选择</NativeSelectOption>
            <NativeSelectOption value="source_confirmed">确认EA原始数据无误</NativeSelectOption>
            <NativeSelectOption value="awaiting_resync">等待EA补传后重新核对</NativeSelectOption>
            <NativeSelectOption value="not_a_trade">确认不是有效交易</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="reconciliation-note">核对说明</FieldLabel>
          <Textarea id="reconciliation-note" rows={3} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="填写核对依据、需要EA补传的范围或最终处理说明" />
        </Field>
        {message && <Alert><AlertTitle>处理结果</AlertTitle><AlertDescription>{message}</AlertDescription></Alert>}
        <Button disabled={saving || note.trim().length < 3 || (state === "resolved" && !resolution)} onClick={save}>
          {saving ? "保存中…" : "保存核对记录"}
        </Button>
        {(data?.events.length ?? 0) > 0 && <div className="space-y-2 border-t pt-3">
          <p className="font-medium text-sm">处理历史</p>
          {data?.events.slice(0, 5).map((event, index) => <div className="text-xs" key={`${event.created_at}-${index}`}>
            <span className="text-muted-foreground">{new Date(event.created_at).toLocaleString("zh-CN")}</span>
            <span className="ml-2">{event.state === "resolved" ? "已处理" : event.state === "investigating" ? "核对中" : "待处理"}</span>
            {event.resolution && <span className="ml-2">{resultNames[event.resolution]}</span>}
            <p className="mt-1 text-muted-foreground">{event.note}</p>
          </div>)}
        </div>}
      </CardContent>
    </Card>
  );
}
