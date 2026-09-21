"use client";

import { useEffect } from "react";

import { useLocale } from "@/lib/i18n";
import { shellText } from "@/lib/shell-i18n";

export function LocalizedDocumentMeta() {
  const locale = useLocale();
  const t = shellText[locale];

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = t.metaTitle;

    let description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!description) {
      description = document.createElement("meta");
      description.name = "description";
      document.head.appendChild(description);
    }
    description.content = t.metaDescription;
  }, [locale, t.metaDescription, t.metaTitle]);

  return null;
}
