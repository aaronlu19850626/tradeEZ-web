"use client";

import { type CSSProperties, useState } from "react";

import { Bell, Check, ChevronDown, Plus, Settings } from "lucide-react";
import { Bar, BarChart } from "recharts";

import { InfoTip } from "@/components/shared/info-tip";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupSeparator, ButtonGroupText } from "@/components/ui/button-group";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarTrigger } from "@/components/ui/menubar";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type TokenSet = Record<string, string>;
type Mode = "light" | "dark";

const palettes = {
  A: {
    name: "Conservative Professional",
    light: {
      background: "#f7f6fb",
      foreground: "#211d2e",
      card: "#ffffff",
      "card-foreground": "#211d2e",
      popover: "#ffffff",
      "popover-foreground": "#211d2e",
      primary: "#6b4fc4",
      "primary-foreground": "#ffffff",
      "primary-hover": "#5a3fa6",
      "primary-soft": "#eeeafb",
      "primary-soft-border": "#cfc4f0",
      secondary: "#f2f0f7",
      "secondary-foreground": "#2c263a",
      muted: "#f1eff7",
      "muted-foreground": "#6f6a7d",
      accent: "#f1eff7",
      "accent-foreground": "#2c263a",
      border: "#e3dfed",
      input: "#d8d3e5",
      ring: "#6b4fc4",
      success: "#2fa77b",
      "success-soft": "#e8f7f1",
      danger: "#dc4c4c",
      "danger-soft": "#fdecec",
      warning: "#d9901a",
      "warning-soft": "#fff5df",
      info: "#3b6fd4",
      "info-soft": "#eaf0ff",
      "chart-1": "#6b4fc4",
      "chart-2": "#2fa77b",
      "chart-3": "#d9901a",
      "chart-4": "#3b6fd4",
      "chart-5": "#d45d8c",
      "chart-6": "#5da7b8",
    },
    dark: {
      background: "#05090d",
      foreground: "#f4f5f6",
      card: "#101418",
      "card-foreground": "#f4f5f6",
      popover: "#12171b",
      "popover-foreground": "#f4f5f6",
      primary: "#7357e6",
      "primary-foreground": "#ffffff",
      "primary-hover": "#6248cb",
      "primary-soft": "#25203d",
      "primary-soft-border": "#45396d",
      secondary: "#171b1f",
      "secondary-foreground": "#e9ebed",
      muted: "#161a1e",
      "muted-foreground": "#85898f",
      accent: "#1c2126",
      "accent-foreground": "#ffffff",
      border: "#2a3035",
      input: "#262c31",
      ring: "#8b72f0",
      success: "#3bcb9a",
      "success-soft": "#122a23",
      danger: "#ff6868",
      "danger-soft": "#321b1d",
      warning: "#f3b43f",
      "warning-soft": "#3b301c",
      info: "#3f7cff",
      "info-soft": "#17233f",
      "chart-1": "#7357e6",
      "chart-2": "#38c995",
      "chart-3": "#f3b43f",
      "chart-4": "#3f7cff",
      "chart-5": "#ef6a9b",
      "chart-6": "#4fc7d8",
    },
  },
  B: {
    name: "Data Dense",
    light: {
      background: "#f5f7fb",
      foreground: "#111827",
      card: "#ffffff",
      "card-foreground": "#111827",
      popover: "#ffffff",
      "popover-foreground": "#111827",
      primary: "#5b46b8",
      "primary-foreground": "#ffffff",
      "primary-hover": "#49358f",
      "primary-soft": "#ece9f8",
      "primary-soft-border": "#c9c0e7",
      secondary: "#eef1f5",
      "secondary-foreground": "#172033",
      muted: "#edf1f7",
      "muted-foreground": "#5b6474",
      accent: "#edf1f7",
      "accent-foreground": "#172033",
      border: "#dbe2ec",
      input: "#cfd8e5",
      ring: "#5b46b8",
      success: "#16865c",
      "success-soft": "#e3f5ec",
      danger: "#cf3f4f",
      "danger-soft": "#fde7e9",
      warning: "#b7791f",
      "warning-soft": "#fff3d8",
      info: "#2f6bd8",
      "info-soft": "#e5eeff",
      "chart-1": "#5b46b8",
      "chart-2": "#16865c",
      "chart-3": "#b7791f",
      "chart-4": "#2f6bd8",
      "chart-5": "#c34f78",
      "chart-6": "#438c9a",
    },
    dark: {
      background: "#10131a",
      foreground: "#f2f5fa",
      card: "#171c26",
      "card-foreground": "#f2f5fa",
      popover: "#1d2430",
      "popover-foreground": "#f2f5fa",
      primary: "#8069df",
      "primary-foreground": "#ffffff",
      "primary-hover": "#6c55c4",
      "primary-soft": "#292442",
      "primary-soft-border": "#4c4273",
      secondary: "#252c39",
      "secondary-foreground": "#f2f5fa",
      muted: "#252c39",
      "muted-foreground": "#9aa6b8",
      accent: "#2d3645",
      "accent-foreground": "#ffffff",
      border: "#313a49",
      input: "#3a4556",
      ring: "#8b76e8",
      success: "#36b37e",
      "success-soft": "#17382d",
      danger: "#ef6270",
      "danger-soft": "#3c2228",
      warning: "#e0a83b",
      "warning-soft": "#3c301c",
      info: "#6792ef",
      "info-soft": "#202d4a",
      "chart-1": "#8b76e8",
      "chart-2": "#36b37e",
      "chart-3": "#e0a83b",
      "chart-4": "#6792ef",
      "chart-5": "#e5799d",
      "chart-6": "#62b6c4",
    },
  },
  C: {
    name: "Modern Trader",
    light: {
      background: "#f6f5fa",
      foreground: "#191728",
      card: "#ffffff",
      "card-foreground": "#191728",
      popover: "#ffffff",
      "popover-foreground": "#191728",
      primary: "#6b4fc4",
      "primary-foreground": "#ffffff",
      "primary-hover": "#5537b3",
      "primary-soft": "#ede8ff",
      "primary-soft-border": "#d1c7f2",
      secondary: "#f0edf8",
      "secondary-foreground": "#27213a",
      muted: "#f0edf8",
      "muted-foreground": "#6f6880",
      accent: "#f0edf8",
      "accent-foreground": "#27213a",
      border: "#ded7f2",
      input: "#d6cdec",
      ring: "#6b4fc4",
      success: "#24a574",
      "success-soft": "#e6f7ef",
      danger: "#df4b57",
      "danger-soft": "#fdebed",
      warning: "#cf8a16",
      "warning-soft": "#fff4da",
      info: "#4b6fdb",
      "info-soft": "#e9eeff",
      "chart-1": "#6b4fc4",
      "chart-2": "#24a574",
      "chart-3": "#cf8a16",
      "chart-4": "#4b6fdb",
      "chart-5": "#d8588e",
      "chart-6": "#4fa5b8",
    },
    dark: {
      background: "#100e18",
      foreground: "#f6f3ff",
      card: "#1a1724",
      "card-foreground": "#f6f3ff",
      popover: "#211c2e",
      "popover-foreground": "#f6f3ff",
      primary: "#8b6de8",
      "primary-foreground": "#ffffff",
      "primary-hover": "#7656d6",
      "primary-soft": "#2b2445",
      "primary-soft-border": "#4f3f7e",
      secondary: "#282238",
      "secondary-foreground": "#f6f3ff",
      muted: "#282238",
      "muted-foreground": "#aca4bf",
      accent: "#312a43",
      "accent-foreground": "#ffffff",
      border: "#383049",
      input: "#433957",
      ring: "#9b7cf0",
      success: "#43c491",
      "success-soft": "#17382d",
      danger: "#f06a76",
      "danger-soft": "#3e2429",
      warning: "#e3ad3c",
      "warning-soft": "#3c311d",
      info: "#7696f1",
      "info-soft": "#222d4c",
      "chart-1": "#9b7cf0",
      "chart-2": "#43c491",
      "chart-3": "#e3ad3c",
      "chart-4": "#7696f1",
      "chart-5": "#ef82ad",
      "chart-6": "#71c1d2",
    },
  },
} satisfies Record<string, { name: string; light: TokenSet; dark: TokenSet }>;

const sections = [
  ["foundation", "色彩与排版"],
  ["actions", "按钮与徽标"],
  ["forms", "表单与筛选"],
  ["navigation", "导航与布局"],
  ["overlays", "弹窗与提示"],
  ["data", "数据展示"],
  ["feedback", "反馈与状态"],
  ["advanced", "图表与复杂组件"],
] as const;

function paletteStyle(tokens: TokenSet): CSSProperties {
  const style: Record<string, string> = { "--radius": "0.75rem" };
  for (const [key, value] of Object.entries(tokens)) {
    style[`--${key}`] = value;
    style[`--color-${key}`] = value;
  }
  return style as CSSProperties;
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-b pb-8 last:border-b-0">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 rounded-lg border bg-card p-3 md:grid-cols-[140px_minmax(0,1fr)] md:items-center">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export default function ThemeReviewPage() {
  const [paletteKey, setPaletteKey] = useState<keyof typeof palettes>("A");
  const [mode, setMode] = useState<Mode>("light");
  const [checked, setChecked] = useState(true);
  const palette = palettes[paletteKey];
  const tokens: TokenSet = palette[mode];
  const chartData = [
    { name: "Mon", value: 42 },
    { name: "Tue", value: 68 },
    { name: "Wed", value: 55 },
    { name: "Thu", value: 81 },
    { name: "Fri", value: 72 },
  ];

  return (
    <div style={paletteStyle(tokens)} className="min-h-full bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-6 px-4 py-5 md:px-6">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
          <div>
            <p className="text-xs font-medium tracking-wide text-primary">THEME REVIEW</p>
            <h1 className="text-2xl font-semibold">三套金融 SaaS 配色评审</h1>
            <p className="text-sm text-muted-foreground">
              当前：方案 {paletteKey} · {palette.name} · {mode === "light" ? "Light" : "Dark"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(palettes) as (keyof typeof palettes)[]).map((key) => (
              <Button
                key={key}
                variant={paletteKey === key ? "primary-soft" : "outline"}
                onClick={() => setPaletteKey(key)}
              >
                方案 {key}
              </Button>
            ))}
            <ButtonGroup>
              <Button variant={mode === "light" ? "secondary" : "outline"} onClick={() => setMode("light")}>
                Light
              </Button>
              <Button variant={mode === "dark" ? "secondary" : "outline"} onClick={() => setMode("dark")}>
                Dark
              </Button>
            </ButtonGroup>
          </div>
        </header>

        <div className="grid gap-8 lg:grid-cols-[190px_minmax(0,1fr)]">
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
            <Section id="foundation" title="色彩与排版" description="背景、表面、主色、语义色和文字层级。">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
                {["background", "card", "primary", "success", "warning", "danger", "info", "muted"].map((token) => (
                  <div key={token} className="overflow-hidden rounded-lg border bg-card">
                    <div className="h-14" style={{ background: tokens[token] }} />
                    <div className="px-2 py-1.5 text-xs">
                      <div className="font-medium">{token}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">{tokens[token]}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid gap-2 rounded-lg border bg-card p-4">
                <h1 className="text-3xl font-semibold">交易总览标题</h1>
                <h2 className="text-xl font-semibold">区域标题</h2>
                <p className="text-sm">正文内容用于展示交易记录、策略说明和风险提示。</p>
                <p className="text-xs text-muted-foreground">辅助说明：金额和百分比使用等宽数字。</p>
                <span className="font-mono text-lg tabular-nums">-$11,791.94 · 64.18% · 0.96R</span>
              </div>
            </Section>

            <Section id="actions" title="按钮与徽标" description="所有操作状态和数据状态。">
              <Row label="按钮">
                <Button>主操作</Button>
                <Button variant="secondary">次要</Button>
                <Button variant="outline">描边</Button>
                <Button variant="ghost">幽灵</Button>
                <Button variant="primary-soft">
                  <Check /> 已选中
                </Button>
                <Button variant="success">成功</Button>
                <Button variant="warning">警告</Button>
                <Button variant="danger">危险</Button>
                <Button variant="info">信息</Button>
              </Row>
              <Row label="尺寸">
                <Button size="sm">小按钮</Button>
                <Button>默认按钮</Button>
                <Button size="lg">大按钮</Button>
                <Button size="icon">
                  <Settings />
                </Button>
                <Button disabled>禁用</Button>
              </Row>
              <Row label="徽标">
                <Badge>默认</Badge>
                <Badge variant="secondary">次要</Badge>
                <Badge variant="outline">描边</Badge>
                <Badge variant="success">盈利</Badge>
                <Badge variant="danger">亏损</Badge>
                <Badge variant="warning">待处理</Badge>
                <Badge variant="info">进行中</Badge>
              </Row>
            </Section>

            <Section id="forms" title="表单与筛选" description="输入、选择、校验和筛选控件。">
              <Row label="输入">
                <Input placeholder="账户名称" className="w-52" />
                <Textarea placeholder="复盘备注" className="w-52" />
                <InputGroup className="w-52">
                  <InputGroupAddon>
                    <InputGroupText>账户</InputGroupText>
                  </InputGroupAddon>
                  <InputGroupInput placeholder="搜索" />
                </InputGroup>
              </Row>
              <Row label="选择器">
                <Select>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="选择币种" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="usd">USD</SelectItem>
                    <SelectItem value="cny">CNY</SelectItem>
                  </SelectContent>
                </Select>
                <NativeSelect className="w-40">
                  <NativeSelectOption>MT5</NativeSelectOption>
                  <NativeSelectOption>CTP</NativeSelectOption>
                </NativeSelect>
              </Row>
              <Row label="选择状态">
                <RadioGroup defaultValue="all" className="w-auto grid-flow-col">
                  <Label className="flex items-center gap-2">
                    <RadioGroupItem value="all" />
                    全部
                  </Label>
                  <Label className="flex items-center gap-2">
                    <RadioGroupItem value="win" />
                    盈利
                  </Label>
                </RadioGroup>
                <Label className="flex items-center gap-2">
                  <Checkbox checked={checked} onCheckedChange={(value) => setChecked(Boolean(value))} />
                  多选
                </Label>
                <Switch checked={checked} onCheckedChange={setChecked} />
                <Slider defaultValue={[60]} className="w-40" />
              </Row>
              <Row label="验证码">
                <InputOTP maxLength={6}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup>
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </Row>
              <Row label="字段组合">
                <Field className="w-64">
                  <FieldLabel>账户名称</FieldLabel>
                  <Input placeholder="请输入账户名称" />
                  <FieldDescription>用于区分不同交易账户。</FieldDescription>
                </Field>
              </Row>
            </Section>

            <Section id="navigation" title="导航与布局" description="栏目、页签、面包屑、分页和折叠结构。">
              <Row label="面包屑">
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbLink href="#">交易</BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>交易记录</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </Row>
              <Row label="标签页">
                <Tabs defaultValue="day" className="w-72">
                  <TabsList>
                    <TabsTrigger value="day">按天</TabsTrigger>
                    <TabsTrigger value="week">按周</TabsTrigger>
                    <TabsTrigger value="all">全部</TabsTrigger>
                  </TabsList>
                  <TabsContent value="day">按天内容</TabsContent>
                  <TabsContent value="week">按周内容</TabsContent>
                  <TabsContent value="all">全部内容</TabsContent>
                </Tabs>
              </Row>
              <Row label="分页">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious href="#" />
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationLink href="#" isActive>
                        1
                      </PaginationLink>
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationLink href="#">2</PaginationLink>
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationNext href="#" />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </Row>
              <Row label="折叠">
                <Accordion type="single" collapsible className="w-64">
                  <AccordionItem value="item">
                    <AccordionTrigger>账户设置</AccordionTrigger>
                    <AccordionContent>账户配置内容</AccordionContent>
                  </AccordionItem>
                </Accordion>
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant="outline">展开详情</Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 text-sm">折叠内容</CollapsibleContent>
                </Collapsible>
              </Row>
            </Section>

            <Section id="overlays" title="弹窗与提示" description="对话框、抽屉、浮层和菜单。">
              <Row label="弹窗">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline">Dialog</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>弹窗标题</DialogTitle>
                      <DialogDescription>弹窗说明</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button variant="outline">关闭</Button>
                      <Button>确认</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="danger-soft">Alert Dialog</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>确认删除</AlertDialogTitle>
                      <AlertDialogDescription>此操作不可撤销。</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction>确认</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="outline">Sheet</Button>
                  </SheetTrigger>
                  <SheetContent>
                    <SheetHeader>
                      <SheetTitle>侧边面板</SheetTitle>
                      <SheetDescription>面板说明</SheetDescription>
                    </SheetHeader>
                  </SheetContent>
                </Sheet>
                <Drawer>
                  <DrawerTrigger asChild>
                    <Button variant="outline">Drawer</Button>
                  </DrawerTrigger>
                  <DrawerContent>
                    <DrawerHeader>
                      <DrawerTitle>底部抽屉</DrawerTitle>
                      <DrawerDescription>抽屉说明</DrawerDescription>
                    </DrawerHeader>
                  </DrawerContent>
                </Drawer>
              </Row>
              <Row label="菜单">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      Dropdown <ChevronDown />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuLabel>操作</DropdownMenuLabel>
                    <DropdownMenuItem>查看</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>删除</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline">Popover</Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56">浮层内容</PopoverContent>
                </Popover>
                <InfoTip label="Tooltip" text="Tooltip 内容" />
                <HoverCard>
                  <HoverCardTrigger asChild>
                    <Button variant="ghost">Hover Card</Button>
                  </HoverCardTrigger>
                  <HoverCardContent>悬停卡片内容</HoverCardContent>
                </HoverCard>
              </Row>
            </Section>

            <Section id="data" title="数据展示" description="卡片、表格、头像、进度和基础数据结构。">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle>账户概览</CardTitle>
                    <CardDescription>今日同步状态</CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm">4 个账户 · 2,905 笔交易</CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>进度</CardTitle>
                    <CardDescription>数据同步进度</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Progress value={68} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>空状态</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Empty>
                      <EmptyMedia variant="icon">
                        <Bell />
                      </EmptyMedia>
                      <EmptyHeader>
                        <EmptyTitle>暂无数据</EmptyTitle>
                        <EmptyDescription>同步后将在此显示。</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </CardContent>
                </Card>
              </div>
              <Row label="表格">
                <div className="w-full overflow-hidden rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>账户</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead className="text-right">净盈亏</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell>UpWay</TableCell>
                        <TableCell>
                          <Badge variant="success">同步中</Badge>
                        </TableCell>
                        <TableCell className="text-right text-profit">+$1,240.50</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>XM</TableCell>
                        <TableCell>
                          <Badge variant="danger">未检测到 EA</Badge>
                        </TableCell>
                        <TableCell className="text-right text-loss">-$428.10</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </Row>
              <Row label="基础元素">
                <Avatar>
                  <AvatarFallback>TZ</AvatarFallback>
                </Avatar>
                <Item className="w-48">
                  <ItemMedia>
                    <Avatar>
                      <AvatarFallback>A</AvatarFallback>
                    </Avatar>
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>账户 A</ItemTitle>
                    <ItemDescription>MT5 · USD</ItemDescription>
                  </ItemContent>
                </Item>
                <Progress value={42} className="w-40" />
                <Skeleton className="h-8 w-28" />
                <Spinner />
                <Kbd>⌘ K</Kbd>
                <ButtonGroup>
                  <ButtonGroupText>1R</ButtonGroupText>
                  <ButtonGroupSeparator />
                  <Button variant="outline">风险</Button>
                </ButtonGroup>
              </Row>
            </Section>

            <Section id="feedback" title="反馈与状态" description="成功、警告、错误、信息、加载和通知。">
              <div className="grid gap-3 md:grid-cols-2">
                <Alert>
                  <Bell />
                  <AlertTitle>系统提示</AlertTitle>
                  <AlertDescription>同步任务已完成。</AlertDescription>
                </Alert>
                <Alert className="border-warning/30 bg-warning-soft text-warning">
                  <Bell />
                  <AlertTitle>风险提醒</AlertTitle>
                  <AlertDescription>当前账户尚未设置止损。</AlertDescription>
                </Alert>
                <Alert className="border-danger/30 bg-danger-soft text-danger">
                  <Bell />
                  <AlertTitle>同步失败</AlertTitle>
                  <AlertDescription>请检查密钥和网络连接。</AlertDescription>
                </Alert>
                <Alert className="border-info/30 bg-info-soft text-info">
                  <Bell />
                  <AlertTitle>信息</AlertTitle>
                  <AlertDescription>新版本连接器已可用。</AlertDescription>
                </Alert>
              </div>
            </Section>

            <Section id="advanced" title="图表与复杂组件" description="图表、命令、日历、滚动和可调整布局。">
              <Row label="图表">
                <ChartContainer
                  config={{ value: { color: tokens["chart-1"], label: "盈亏" } }}
                  className="h-48 w-full max-w-md"
                >
                  <BarChart data={chartData}>
                    <Bar dataKey="value" fill="var(--color-value)" radius={[3, 3, 0, 0]} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                  </BarChart>
                </ChartContainer>
              </Row>
              <Row label="命令与日历">
                <Command className="w-72 rounded-lg border">
                  <CommandInput placeholder="搜索命令" />
                  <CommandList>
                    <CommandEmpty>无结果</CommandEmpty>
                    <CommandGroup heading="操作">
                      <CommandItem>打开交易记录</CommandItem>
                      <CommandItem>同步账户</CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
                <Calendar mode="single" className="rounded-lg border" />
              </Row>
              <Row label="滚动与缩放">
                <ScrollArea className="h-32 w-60 rounded-md border p-3">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((item) => (
                    <p key={item} className="py-1 text-sm">
                      滚动内容 {item}
                    </p>
                  ))}
                </ScrollArea>
                <ResizablePanelGroup orientation="horizontal" className="h-32 w-80 rounded-lg border">
                  <ResizablePanel defaultSize={50}>
                    <div className="grid h-full place-items-center text-sm">左面板</div>
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={50}>
                    <div className="grid h-full place-items-center text-sm">右面板</div>
                  </ResizablePanel>
                </ResizablePanelGroup>
              </Row>
              <Row label="轮播与比例">
                <Carousel className="w-64 px-8">
                  <CarouselContent>
                    {[1, 2, 3].map((item) => (
                      <CarouselItem key={item}>
                        <div className="grid h-24 place-items-center rounded-lg border bg-card">幻灯片 {item}</div>
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  <CarouselPrevious />
                  <CarouselNext />
                </Carousel>
                <AspectRatio ratio={16 / 9} className="w-48 overflow-hidden rounded-lg border bg-muted">
                  <div className="grid h-full place-items-center text-sm">16:9</div>
                </AspectRatio>
              </Row>
              <Row label="右键菜单">
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <Button variant="outline">右键菜单</Button>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem>查看详情</ContextMenuItem>
                    <ContextMenuItem>复制</ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem>删除</ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              </Row>
            </Section>
          </main>
        </div>
      </div>
    </div>
  );
}
