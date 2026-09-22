"use client";

import { type ReactNode, useState } from "react";

import { Bell, Check, ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal, Settings } from "lucide-react";

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { CurrencySelect } from "@/components/domain/currency-select";
import { PlatformSelect } from "@/components/domain/platform-select";
import {
  AccountScopeMenu,
  DatePickerField,
  RangeControl,
  type SelectConditionGroup,
  SelectMultiConditionControl,
  SelectSingleControl,
} from "@/components/filters";
import { InfoTip } from "@/components/shared/info-tip";
import { LoadingWave } from "@/components/shared/loading-wave";
import { MarketColorProvider } from "@/components/shared/market-color-provider";
import { TradeSideBadge } from "@/components/shared/trade-side-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupSeparator, ButtonGroupText } from "@/components/ui/button-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  formatCount,
  formatMoney,
  formatMoneyAxis,
  formatMoneyCompact,
  formatMoneyStat,
  formatPercent,
  formatPrice,
} from "@/lib/format-numbers";
import { useLocale } from "@/lib/i18n";

const sections = [
  ["actions", "按钮与徽标"],
  ["forms", "表单"],
  ["filters", "全局筛选器"],
  ["navigation", "导航与切换"],
  ["data", "数据展示"],
  ["feedback", "反馈与状态"],
  ["overlays", "弹窗与提示"],
  ["market-colors", "市场配色"],
  ["numbers", "数值格式"],
] as const;

const accountOptions = [
  { id: "all", name: "全部账户", isStatistics: true },
  { id: "gold", name: "Sim-Gold-A", isStatistics: true },
  { id: "fx", name: "Sim-FX-B", isStatistics: false },
  { id: "long", name: "二十年级别历史账户", isStatistics: false },
];

const conditionGroups: SelectConditionGroup[] = [
  {
    id: "side",
    label: "方向",
    mode: "single",
    options: [
      { value: "all", label: "全部" },
      { value: "buy", label: "做多" },
      { value: "sell", label: "做空" },
    ],
  },
  {
    id: "result",
    label: "结果",
    mode: "single",
    options: [
      { value: "all", label: "全部" },
      { value: "win", label: "盈利" },
      { value: "loss", label: "亏损" },
    ],
  },
  {
    id: "symbol",
    label: "品种",
    mode: "multiple",
    options: [
      { value: "XAUUSD", label: "XAUUSD" },
      { value: "EURUSD", label: "EURUSD" },
      { value: "GBPUSD", label: "GBPUSD" },
      { value: "USDJPY", label: "USDJPY" },
    ],
  },
];

interface DemoTrade {
  id: string;
  symbol: string;
  side: string;
  net: number;
}

const demoTrades: DemoTrade[] = [
  { id: "1", symbol: "XAUUSD", side: "做多", net: 1240.5 },
  { id: "2", symbol: "EURUSD", side: "做空", net: -326.8 },
  { id: "3", symbol: "GBPUSD", side: "做多", net: 585.2 },
];

const demoColumns: DataTableColumn<DemoTrade>[] = [
  {
    accessorKey: "symbol",
    header: "品种",
    size: 140,
    cell: ({ row }) => <span className="font-medium">{row.original.symbol}</span>,
  },
  {
    accessorKey: "side",
    header: "方向",
    size: 100,
    meta: { className: "text-center" },
    cell: ({ row }) => (
      <TradeSideBadge side={row.original.side === "做多" ? "buy" : "sell"} buyLabel="做多" sellLabel="做空" />
    ),
  },
  {
    accessorKey: "net",
    header: "净盈亏",
    size: 140,
    meta: { className: "text-right" },
    cell: ({ row }) => {
      const locale = "zh-CN";
      return (
        <span className={row.original.net >= 0 ? "text-profit" : "text-loss"}>
          {formatMoney(row.original.net, locale)}
        </span>
      );
    },
  },
];

function Section({
  id,
  title,
  description,
  children,
  wide = false,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-b pb-8 last:border-b-0">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className={wide ? "grid gap-4" : "flex flex-wrap items-center gap-3"}>{children}</div>
    </section>
  );
}

export default function DesignSystemPage() {
  const locale = useLocale();
  const [switchOn, setSwitchOn] = useState(true);
  const [dateValue, setDateValue] = useState("2026-09-18");
  const [platform, setPlatform] = useState("mt5");
  const [currency, setCurrency] = useState("USD");
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(["gold", "fx"]);
  const [conditions, setConditions] = useState<Record<string, string[]>>({
    side: ["buy"],
    symbol: ["XAUUSD", "EURUSD"],
  });
  const [dateRange, setDateRange] = useState({ from: "2026-09-01", to: "2026-09-22" });
  const [view, setView] = useState("day");
  const [page, setPage] = useState(2);
  const [pageInput, setPageInput] = useState("2");

  function commitPage() {
    const next = Math.min(12, Math.max(1, Number(pageInput) || 1));
    setPage(next);
    setPageInput(String(next));
  }

  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-8">
      <header className="border-b pb-5">
        <h1 className="text-2xl font-semibold">设计系统</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          以现有三个业务模块为基线，统一查看全局组件、交互状态和数值格式。
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[172px_minmax(0,1fr)]">
        <aside className="self-start lg:sticky lg:top-5">
          <nav className="grid gap-1">
            {sections.map(([id, label]) => (
              <Button key={id} asChild variant="ghost" className="justify-start">
                <a href={`#${id}`}>{label}</a>
              </Button>
            ))}
          </nav>
        </aside>

        <main className="grid gap-8">
          <Section id="actions" title="按钮与徽标" description="操作层级、语义状态和可用的标准尺寸。">
            <Button>默认按钮</Button>
            <Button variant="secondary">次要按钮</Button>
            <Button variant="outline">描边按钮</Button>
            <Button variant="ghost">幽灵按钮</Button>
            <Button variant="destructive">危险按钮</Button>
            <Button variant="link">链接按钮</Button>
            <Button variant="success">成功</Button>
            <Button variant="success-soft">成功浅色</Button>
            <Button variant="warning">警告</Button>
            <Button variant="warning-soft">警告浅色</Button>
            <Button variant="danger">危险</Button>
            <Button variant="danger-soft">危险浅色</Button>
            <Button variant="info">信息</Button>
            <Button variant="info-soft">信息浅色</Button>
            <Button variant="primary-soft">
              <Check />
              已选中
            </Button>
            <Button size="xs">极小按钮</Button>
            <Button size="sm">小按钮</Button>
            <Button size="form">表单尺寸</Button>
            <Button size="lg">大按钮</Button>
            <Button size="icon" aria-label="设置">
              <Settings />
            </Button>
            <Button disabled>禁用按钮</Button>

            <ButtonGroup>
              <Button variant="outline">左</Button>
              <Button variant="outline">中</Button>
              <Button variant="outline">右</Button>
            </ButtonGroup>
            <ButtonGroup>
              <ButtonGroupText>数量</ButtonGroupText>
              <ButtonGroupSeparator />
              <Button variant="outline">12</Button>
            </ButtonGroup>

            <Badge>默认</Badge>
            <Badge variant="secondary">次要</Badge>
            <Badge variant="outline">描边</Badge>
            <Badge variant="success">成功</Badge>
            <Badge variant="success-soft">成功浅色</Badge>
            <Badge variant="warning">警告</Badge>
            <Badge variant="warning-soft">警告浅色</Badge>
            <Badge variant="danger">危险</Badge>
            <Badge variant="danger-soft">危险浅色</Badge>
            <Badge variant="info">信息</Badge>
            <Badge variant="info-soft">信息浅色</Badge>
            <Badge variant="primary-soft">已选中</Badge>
          </Section>

          <Section id="forms" title="表单" description="输入、选择、日期、单选、复选、开关和滑杆。">
            <Input placeholder="文本输入" className="w-56" />
            <div className="w-56">
              <DatePickerField
                label="日期"
                value={dateValue}
                onChange={setDateValue}
                placeholder="年/月/日"
                clearLabel="清除日期"
              />
            </div>
            <Textarea placeholder="多行文本" className="w-56" />
            <Select>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="选择选项" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="one">选项一</SelectItem>
                <SelectItem value="two">选项二</SelectItem>
              </SelectContent>
            </Select>
            <RadioGroup defaultValue="buy" className="w-auto grid-flow-col">
              <Label className="flex items-center gap-2">
                <RadioGroupItem value="buy" />
                做多
              </Label>
              <Label className="flex items-center gap-2">
                <RadioGroupItem value="sell" />
                做空
              </Label>
            </RadioGroup>
            <Label className="flex items-center gap-2">
              <Checkbox defaultChecked />
              复选框
            </Label>
            <div className="flex items-center gap-2">
              <Switch checked={switchOn} onCheckedChange={setSwitchOn} />
              开关
            </div>
            <Slider defaultValue={[35]} className="w-48" />
            <div className="grid w-full max-w-3xl gap-4">
              <PlatformSelect label="交易平台" value={platform} onChange={setPlatform} />
              <CurrencySelect label="账户币种" value={currency} onChange={setCurrency} disabled={platform === "ctp"} />
            </div>
          </Section>

          <Section
            id="filters"
            title="全局筛选器"
            description="业务页面统一从 @/components/filters 引用，不复制面板结构和状态样式。"
          >
            <SelectSingleControl
              value={currency}
              options={[
                { value: "USD", label: "USD" },
                { value: "CNY", label: "CNY" },
                { value: "EUR", label: "EUR" },
              ]}
              onValueChange={setCurrency}
            />
            <AccountScopeMenu accounts={accountOptions} selectedIds={selectedAccounts} onApply={setSelectedAccounts} />
            <SelectMultiConditionControl value={conditions} groups={conditionGroups} onChange={setConditions} />
            <RangeControl
              range={dateRange}
              onRange={(from, to) => setDateRange({ from, to })}
              latestDay="2026-09-22"
              earliestDay="2020-01-01"
            />
            <div className="w-60">
              <DatePickerField
                label="同步开始日期"
                value={dateValue}
                onChange={setDateValue}
                placeholder="留空表示全部历史"
                clearLabel="清除日期"
                hint="留空默认同步全部历史交易"
              />
            </div>
          </Section>

          <Section id="navigation" title="导航与切换" description="Tab、Toggle、下拉菜单和分页输入。">
            <Tabs defaultValue="overview" className="w-80">
              <TabsList>
                <TabsTrigger value="overview">总览</TabsTrigger>
                <TabsTrigger value="trades">交易</TabsTrigger>
              </TabsList>
              <TabsContent value="overview" className="text-sm text-muted-foreground">
                当前选中态使用主色浅底和高亮文字。
              </TabsContent>
              <TabsContent value="trades" className="text-sm text-muted-foreground">
                交易内容
              </TabsContent>
            </Tabs>

            <ToggleGroup
              type="single"
              value={view}
              onValueChange={(next) => {
                if (next) setView(next);
              }}
              className="rounded-lg bg-muted p-1"
            >
              <ToggleGroupItem value="day">按天</ToggleGroupItem>
              <ToggleGroupItem value="week">按周</ToggleGroupItem>
              <ToggleGroupItem value="all">全部</ToggleGroupItem>
            </ToggleGroup>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  打开菜单 <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-48">
                <DropdownMenuLabel>菜单</DropdownMenuLabel>
                <DropdownMenuItem>操作一</DropdownMenuItem>
                <DropdownMenuItem>操作二</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="warning">需要谨慎的操作</DropdownMenuItem>
                <DropdownMenuItem variant="destructive">删除操作</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex w-full flex-wrap items-center justify-end gap-2">
              <Pagination className="mx-0 h-8 w-auto items-center justify-end">
                <PaginationContent className="h-8 items-center">
                  <PaginationItem>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="上一页"
                      disabled={page <= 1}
                      onClick={() => {
                        setPage((current) => Math.max(1, current - 1));
                        setPageInput(String(Math.max(1, page - 1)));
                      }}
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                  </PaginationItem>
                  <PaginationItem>
                    <Badge
                      aria-current="page"
                      variant="outline"
                      className="h-8 px-3 text-sm font-normal tabular-nums whitespace-nowrap"
                    >
                      第 {page} / 12 页
                    </Badge>
                  </PaginationItem>
                  <PaginationItem>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="下一页"
                      disabled={page >= 12}
                      onClick={() => {
                        setPage((current) => Math.min(12, current + 1));
                        setPageInput(String(Math.min(12, page + 1)));
                      }}
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </PaginationItem>
                  <PaginationItem>
                    <Input
                      type="number"
                      min={1}
                      max={12}
                      value={pageInput}
                      aria-label="跳转到页码"
                      className="w-14 px-1 py-0! text-center text-sm leading-none tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      style={{ height: "32px", minHeight: "32px" }}
                      onChange={(event) => setPageInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") commitPage();
                      }}
                      onBlur={commitPage}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-1.5 font-normal">
                    <MoreHorizontal className="size-4" />
                    批量操作
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>导出当前页</DropdownMenuItem>
                  <DropdownMenuItem>导出全部结果</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </Section>

          <Section id="data" title="数据展示" description="标准数据表、头像、进度、骨架和状态元素。" wide>
            <div className="flex flex-wrap items-center gap-3">
              <Avatar>
                <AvatarFallback>TZ</AvatarFallback>
              </Avatar>
              <Progress value={62} className="w-56" />
              <Spinner />
              <Skeleton className="h-8 w-32" />
              <Badge variant="success-soft">已同步</Badge>
              <Badge variant="warning-soft">待处理</Badge>
              <Badge variant="danger-soft">失败</Badge>
            </div>
            <DataTable
              columns={demoColumns}
              data={demoTrades}
              getRowId={(row) => row.id}
              className="rounded-lg"
              tableClassName="table-fixed"
            />
          </Section>

          <Section id="feedback" title="反馈与状态" description="信息提示、状态卡片和 Tooltip 入口。">
            <Alert className="w-96">
              <Bell />
              <AlertTitle>提醒</AlertTitle>
              <AlertDescription>这是一条系统提示。</AlertDescription>
            </Alert>
            <Card className="w-80">
              <CardHeader>
                <CardTitle>卡片标题</CardTitle>
                <CardDescription>卡片描述</CardDescription>
              </CardHeader>
              <CardContent>卡片内容</CardContent>
            </Card>
            <InfoTip label="提示" text="提示内容" />
            <div className="w-full rounded-lg border bg-card p-4">
              <LoadingWave compact title="正在加载" description="标准加载反馈" />
            </div>
          </Section>

          <Section id="overlays" title="弹窗与提示" description="Dialog、Popover 和标准底部操作。">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">打开弹窗</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>弹窗标题</DialogTitle>
                  <DialogDescription>这是弹窗描述。</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline">关闭</Button>
                  <Button>确认</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline">气泡</Button>
              </PopoverTrigger>
              <PopoverContent className="w-56">气泡内容</PopoverContent>
            </Popover>
          </Section>

          <Section
            id="market-colors"
            title="市场配色"
            description="国内市场红涨绿跌，外汇市场绿涨红跌；同步与错误语义色保持不变。"
            wide
          >
            <div className="grid gap-4 md:grid-cols-2">
              <MarketColorProvider profile="cn">
                <div className="rounded-lg border bg-card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">国内市场</p>
                      <p className="text-xs text-muted-foreground">股票与期货 · 红涨绿跌</p>
                    </div>
                    <Badge variant="primary-soft">CN</Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-md bg-profit-soft px-3 py-2">
                      <p className="text-xs text-muted-foreground">盈利</p>
                      <p className="font-semibold text-profit tabular-nums">{formatMoney(12800, locale, "CNY")}</p>
                    </div>
                    <div className="rounded-md bg-loss-soft px-3 py-2">
                      <p className="text-xs text-muted-foreground">亏损</p>
                      <p className="font-semibold text-loss tabular-nums">{formatMoney(-4600, locale, "CNY")}</p>
                    </div>
                  </div>
                </div>
              </MarketColorProvider>

              <MarketColorProvider profile="fx">
                <div className="rounded-lg border bg-card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">外汇市场</p>
                      <p className="text-xs text-muted-foreground">外汇与海外品种 · 绿涨红跌</p>
                    </div>
                    <Badge variant="info-soft">FX</Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-md bg-profit-soft px-3 py-2">
                      <p className="text-xs text-muted-foreground">盈利</p>
                      <p className="font-semibold text-profit tabular-nums">{formatMoney(12800, locale)}</p>
                    </div>
                    <div className="rounded-md bg-loss-soft px-3 py-2">
                      <p className="text-xs text-muted-foreground">亏损</p>
                      <p className="font-semibold text-loss tabular-nums">{formatMoney(-4600, locale)}</p>
                    </div>
                  </div>
                </div>
              </MarketColorProvider>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="success-soft">同步成功仍为绿色</Badge>
              <Badge variant="danger-soft">系统错误仍为红色</Badge>
              <Badge variant="warning-soft">警告语义不受市场影响</Badge>
            </div>
          </Section>

          <Section id="numbers" title="数值格式" description="金额、数量、百分比和价格统一由全局格式化器输出。" wide>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["精确金额", formatMoney(-12345.67, locale)],
                ["统计金额", formatMoneyStat(-12345.67, locale)],
                ["图表金额", formatMoneyCompact(-12345.67, locale)],
                ["坐标轴金额", formatMoneyAxis(-12345.67, locale)],
                ["人民币金额", formatMoney(12345.67, locale, "CNY")],
                ["数量", formatCount(62400, locale)],
                ["百分比", formatPercent(64.18, locale)],
                ["品种价格", formatPrice(2045.5, locale)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border bg-card px-4 py-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 font-semibold text-lg tabular-nums">{value}</p>
                </div>
              ))}
            </div>
          </Section>

          <Separator />
          <p className="text-sm text-muted-foreground">
            组件底层来自 `src/components/ui`，筛选器来自 `@/components/filters`，数值格式来自 `@/lib/format-numbers`。
          </p>
        </main>
      </div>
    </div>
  );
}
