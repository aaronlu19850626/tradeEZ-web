import type { MetadataRoute } from "next";

const SITE_URL = "https://tradeez.example.com";

// 注册入口当前统一跳转到登录页，因此只登记登录路由。
const PUBLIC_ROUTES = ["/auth/v2/login"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((route) => ({
    url: `${SITE_URL}${route}`,
  }));
}
