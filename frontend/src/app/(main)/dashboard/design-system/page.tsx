"use client";

import { useState } from "react";

import { Bell, Check, ChevronDown, Plus, Settings, X } from "lucide-react";

import { DatePickerField } from "@/components/filters/date-picker-field";
import { InfoTip } from "@/components/shared/info-tip";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  );
}

export default function DesignSystemPage() {
  const [switchOn, setSwitchOn] = useState(true);
  const [dateValue, setDateValue] = useState("");

  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-10">
      <header>
        <h1 className="text-2xl font-semibold">组件样式总览</h1>
        <p className="text-sm text-muted-foreground">按样式集统一查看当前框架提供的全局组件。</p>
      </header>

      <Section title="按钮" description="主操作、次操作、幽灵、危险、链接与不同尺寸。">
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
          账户选中
        </Button>
        <Button size="sm">小按钮</Button>
        <Button size="form">表单尺寸</Button>
        <Button size="lg">大按钮</Button>
        <Button size="icon">
          <Settings />
        </Button>
        <Button disabled>禁用按钮</Button>
      </Section>

      <Section title="按钮组" description="用于连续操作和输入框附加按钮。">
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
      </Section>

      <Section title="表单" description="输入、文本域、选择、单选、复选、开关和滑杆。">
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
      </Section>

      <Section title="导航与切换" description="标签页和下拉菜单。">
        <Tabs defaultValue="overview" className="w-96">
          <TabsList>
            <TabsTrigger value="overview">总览</TabsTrigger>
            <TabsTrigger value="trades">交易</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">总览内容</TabsContent>
          <TabsContent value="trades">交易内容</TabsContent>
        </Tabs>
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
      </Section>

      <Section title="覆盖层" description="弹窗、气泡和提示。">
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
        <InfoTip label="提示" text="提示内容" />
      </Section>

      <Section title="数据展示" description="徽标、头像、进度、骨架和表格。">
        <Badge>默认</Badge>
        <Badge variant="secondary">次要</Badge>
        <Badge variant="outline">描边</Badge>
        <Badge variant="destructive">危险</Badge>
        <Badge variant="success">成功</Badge>
        <Badge variant="success-soft">成功浅色</Badge>
        <Badge variant="warning">警告</Badge>
        <Badge variant="warning-soft">警告浅色</Badge>
        <Badge variant="danger">危险</Badge>
        <Badge variant="danger-soft">危险浅色</Badge>
        <Badge variant="info">信息</Badge>
        <Badge variant="info-soft">信息浅色</Badge>
        <Badge variant="primary-soft">已选中</Badge>
        <Avatar>
          <AvatarFallback>TZ</AvatarFallback>
        </Avatar>
        <Progress value={62} className="w-56" />
        <Spinner />
        <Skeleton className="h-8 w-32" />
      </Section>

      <Section title="反馈" description="提示信息与状态卡片。">
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
      </Section>

      <Section title="表格" description="基础数据表格。">
        <div className="w-full max-w-2xl rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">数值</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>示例</TableCell>
                <TableCell>
                  <Badge>正常</Badge>
                </TableCell>
                <TableCell className="text-right">100</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Section>

      <Separator />
      <p className="text-sm text-muted-foreground">以上组件均来自 `src/components/ui` 的全局样式集。</p>
    </div>
  );
}
