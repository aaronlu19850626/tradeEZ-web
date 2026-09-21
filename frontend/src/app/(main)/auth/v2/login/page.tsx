import { LoginForm } from "../../_components/login-form";

export default function LoginPage() {
  return (
    <div className="mx-auto flex w-full flex-col justify-center space-y-8 sm:w-[400px]">
      <div className="space-y-2 text-center">
        <h1 className="font-medium text-3xl">TradeEZ Web</h1>
        <p className="text-muted-foreground text-sm">使用手机号或邮箱验证码登录 / 注册。</p>
      </div>
      <LoginForm />
    </div>
  );
}
