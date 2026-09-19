"use client";

import { Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { getEaServerOrigin } from "@/lib/tradesync/api";

export function EaConnection({ syncKey, disabled = false }: { syncKey?: string; disabled?: boolean }) {
  const [origin, setOrigin] = useState(getEaServerOrigin);
  const [address, setAddress] = useState(getEaServerOrigin);
  const [addressError, setAddressError] = useState("");
  useEffect(() => {
    try {
      const stored = localStorage.getItem("tradesync-ea-origin");
      if (stored) {
        const url = new URL(stored);
        if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) {
          setOrigin(url.origin); setAddress(url.origin);
        }
      }
    } catch { /* Browser storage may be unavailable; keep the configured default. */ }
  }, []);
  function saveAddress() {
    try {
      const url = new URL(address.trim());
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname)) {
        throw new Error("请仅填写 http(s)://主机:端口，不包含 /api/v1、用户名、密码或查询参数。");
      }
      setOrigin(url.origin); setAddress(url.origin); setAddressError("");
      try { localStorage.setItem("tradesync-ea-origin", url.origin); toast.success("EA 地址已保存在当前浏览器"); }
      catch { toast.success("EA 地址已应用，本浏览器无法持久保存"); }
    } catch (e) { setAddressError(e instanceof Error ? e.message : "地址格式不正确"); }
  }
  const local = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::|$)/.test(origin);
  const parameters = [
    "Inp_EnableSync=true",
    `Inp_ApiBaseURL=${origin}`,
    `Inp_SecretKey=${syncKey || "<填写该账号的完整 sk_live_ 密钥>"}`,
    "Inp_SyncIntervalMin=5",
    "Inp_RequestTimeoutMS=800",
    "Inp_MaxBatchSize=100",
    "Inp_DebugSync=true",
  ].join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(parameters);
      toast.success(syncKey ? "EA 参数已复制，请妥善保管其中的密钥" : "参数模板已复制，请补入已有密钥");
    } catch {
      toast.error("复制失败，请手动选择下方参数复制");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>填写到 tradeEZ EA 的同步参数</CardTitle>
        <CardDescription>适用于 tradeEZ 主 EA 的“数据同步 Data Sync”分组。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <FieldGroup><Field><FieldLabel htmlFor="ea-server-address">EA 访问的服务端地址</FieldLabel>
          <Input id="ea-server-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="http://192.168.31.116:8000" />
        </Field></FieldGroup>
        <Button variant="outline" onClick={saveAddress}>应用到参数模板</Button>
        <p className="text-muted-foreground text-sm">同机可用 127.0.0.1；其他电脑的 EA 需填写服务端局域网地址。此设置只保存地址，不保存密钥，也不会修改 MT5。</p>
        {addressError && <Alert variant="destructive"><AlertTitle>地址格式错误</AlertTitle><AlertDescription>{addressError}</AlertDescription></Alert>}
        {disabled && (
          <Alert variant="destructive">
            <AlertTitle>账号已停用</AlertTitle>
            <AlertDescription>请先在账号列表恢复账号，服务端才会接受同步。</AlertDescription>
          </Alert>
        )}
        <Textarea aria-label="EA 同步参数" readOnly value={parameters} rows={8} />
        <p className="text-muted-foreground text-xs">复制内容保留 EA 所需的原始参数名：启用同步（Inp_EnableSync）、服务端地址（Inp_ApiBaseURL）、同步密钥（Inp_SecretKey）、同步间隔／分钟（Inp_SyncIntervalMin）、请求超时／毫秒（Inp_RequestTimeoutMS）、每批成交条数（Inp_MaxBatchSize）、调试日志（Inp_DebugSync）。其中 true 表示开启，false 表示关闭。</p>
        <Button variant="outline" onClick={copy}>
          <Copy data-icon="inline-start" />复制{syncKey ? "完整参数" : "参数模板"}
        </Button>
        <Alert>
          <AlertTitle>MT5 WebRequest 白名单</AlertTitle>
          <AlertDescription>
            在“工具 → 选项 → EA 交易”中允许 WebRequest，并添加 {origin}。
            Inp_ApiBaseURL 不要追加 /api/v1 或末尾斜杠，EA 会自行拼接接口路径。
            {local && " 当前地址只适用于 MT5 与后端在同一台电脑的情况。"}
            当前主 EA 实际请求超时为 200–800ms；常规定时同步等待全账户空仓且界面空闲。
            有持仓时可手动确认后同步，长时间未收到心跳不等于离线。
          </AlertDescription>
        </Alert>
        {!syncKey && (
          <p className="text-muted-foreground text-sm">
            密钥只在绑定或重置时完整显示。请填入已保存的完整密钥，列表中的前缀不能用于同步。
          </p>
        )}
      </CardContent>
    </Card>
  );
}
