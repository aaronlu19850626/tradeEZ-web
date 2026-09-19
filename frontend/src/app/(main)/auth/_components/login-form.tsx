"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAuthConfig, sendLoginCode, setToken, verifyLoginCode, type LoginIdentity } from "@/lib/tradesync/api";

export function LoginForm() {
  const [channel, setChannel] = useState("phone");
  const [contact, setContact] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"send" | "verify" | null>(null);
  const busyRef = useRef(false);
  const [testMode, setTestMode] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [contactError, setContactError] = useState("");
  const [codeError, setCodeError] = useState("");
  const [deadlines, setDeadlines] = useState<Record<string, number>>({});
  const [now, setNow] = useState(0);
  const normalized = channel === "phone" ? contact.trim().replace(/^\+86/, "") : contact.trim().toLowerCase();
  const identityKey = `${channel}:${normalized}`;
  const cooldown = Math.max(0, Math.ceil(((deadlines[identityKey] ?? 0) - now) / 1000));

  useEffect(() => {
    let active = true;
    getAuthConfig().then((result) => { if (active) setTestMode(result.test_mode); }).catch(() => {});
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  function identity(): LoginIdentity | null {
    const valid = channel === "phone" ? /^1[3-9][0-9]{9}$/.test(normalized) : /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized);
    setContactError(valid ? "" : channel === "phone" ? "请输入中国大陆 11 位手机号。" : "请输入有效邮箱地址。");
    return valid ? channel === "phone" ? { phone: normalized } : { email: normalized } : null;
  }

  function resetFeedback() {
    setCode(""); setMessage(""); setError(""); setContactError(""); setCodeError("");
  }

  async function handleSendCode() {
    if (busyRef.current || cooldown > 0) return;
    const target = identity();
    if (!target) return;
    busyRef.current = true;
    setBusy("send"); setError(""); setMessage(""); setCode(""); setCodeError("");
    try {
      const result = await sendLoginCode(target);
      setDeadlines((previous) => ({ ...previous, [identityKey]: Date.now() + result.cooldown_seconds * 1000 }));
      setNow(Date.now());
      setMessage(result.message);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "发送失败，请稍后重试。");
    } finally { busyRef.current = false; setBusy(null); }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current) return;
    const target = identity();
    const validCode = /^[0-9]{6}$/.test(code);
    setCodeError(validCode ? "" : "请输入 6 位数字验证码。");
    if (!target || !validCode) return;
    busyRef.current = true;
    setBusy("verify"); setError("");
    try {
      const result = await verifyLoginCode(target, code);
      setToken(result.access_token);
      toast.success(result.is_new_user ? "注册并登录成功" : "登录成功");
      window.location.assign("/dashboard/today");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "登录失败，请检查验证码。");
      busyRef.current = false; setBusy(null);
    }
  }

  return (
    <Tabs value={channel} onValueChange={(value) => { if (!busyRef.current) { setChannel(value); setContact(""); resetFeedback(); } }}>
      <TabsList className="w-full" aria-label="注册登录方式">
        <TabsTrigger value="phone" disabled={!!busy}>手机号</TabsTrigger>
        <TabsTrigger value="email" disabled={!!busy}>邮箱</TabsTrigger>
      </TabsList>
      <TabsContent value={channel}>
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
          {testMode && <Alert><AlertDescription>当前为测试环境：请先获取验证码，再填写 123456。不会实际发送短信或邮件。</AlertDescription></Alert>}
          <FieldGroup className="gap-4">
            <Field data-invalid={!!contactError}>
              <FieldLabel htmlFor="login-contact">{channel === "phone" ? "手机号（中国大陆 +86）" : "邮箱地址"}</FieldLabel>
              <Input id="login-contact" value={contact} type={channel === "phone" ? "tel" : "email"}
                autoComplete={channel === "phone" ? "tel" : "email"} maxLength={channel === "phone" ? 20 : 254}
                placeholder={channel === "phone" ? "请输入 11 位手机号" : "you@example.com"}
                disabled={!!busy} aria-invalid={!!contactError} aria-describedby={contactError ? "contact-error" : undefined}
                onChange={(event) => { setContact(event.target.value); resetFeedback(); }} />
              {contactError && <FieldError id="contact-error">{contactError}</FieldError>}
            </Field>
            <Field data-invalid={!!codeError}>
              <FieldLabel htmlFor="login-code">{channel === "phone" ? "短信验证码" : "邮箱验证码"}</FieldLabel>
              <div className="flex gap-2">
                <Input id="login-code" value={code} onChange={(event) => { setCode(event.target.value); setCodeError(""); }}
                  inputMode="numeric" maxLength={6} placeholder="6 位验证码" autoComplete="one-time-code"
                  disabled={!!busy} aria-invalid={!!codeError} aria-describedby={codeError ? "code-error" : undefined} />
                <Button type="button" variant="outline" onClick={handleSendCode} disabled={!!busy || cooldown > 0}>
                  {busy === "send" ? "发送中…" : cooldown > 0 ? `${cooldown} 秒后重发` : "获取验证码"}
                </Button>
              </div>
              {codeError && <FieldError id="code-error">{codeError}</FieldError>}
            </Field>
          </FieldGroup>
          {message && <Alert><AlertDescription aria-live="polite">{message}</AlertDescription></Alert>}
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <Button className="w-full" type="submit" disabled={!!busy}>{busy === "verify" ? "验证中…" : "登录 / 注册"}</Button>
          <p className="text-muted-foreground text-center text-xs">首次验证通过后自动注册。手机号与邮箱分别注册的账号独立；已有邮箱账号请使用邮箱登录。</p>
        </form>
      </TabsContent>
    </Tabs>
  );
}
