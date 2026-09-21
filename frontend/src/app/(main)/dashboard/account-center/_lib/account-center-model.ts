"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";

import {
  Check,
  Copy,
  FileText,
  FileUp,
  HelpCircle,
  History,
  KeyRound,
  KeySquare,
  MoreVertical,
  Plus,
  RefreshCw,
  Star,
  StarOff,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { DialogBody, DialogContent } from "@/components/dialogs/dialog-content";
import { CurrencySelect } from "@/components/domain/currency-select";
import { PlatformIcon } from "@/components/domain/platform-icon";
import { PlatformSelect } from "@/components/domain/platform-select";
import { DatePickerField } from "@/components/filters/date-picker-field";
import { InfoTip } from "@/components/shared/info-tip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocale } from "@/lib/i18n";
import {
  type AccountCenterItem,
  type AccountImportResult,
  accountCenterApi,
  importAccountDeals,
} from "@/lib/tradesync/account-center";
import { type AccountCenterText, accountCenterText, fill } from "@/lib/tradesync/account-center-i18n";
import { ApiClientError, clearSessionCookie, clearToken } from "@/lib/tradesync/api";
import { defaultCurrencyForPlatform } from "@/lib/tradesync/currencies";

export type Modal = "add" | "rename" | "key" | "rotate" | "reset" | "delete" | "import" | "help" | null;

export interface AccountForm {
  name: string;
  platform: string;
  currency: string;
  server: string;
  login: string;
  syncStart: string;
}

export const EMPTY_ACCOUNT_FORM: AccountForm = {
  name: "",
  platform: "mt5",
  currency: "USD",
  server: "",
  login: "",
  syncStart: "",
};

export * from "./formatters";
