"use client";

import { useEffect, useState } from "react";

import { GripVertical, Plus, Trash2 } from "lucide-react";

import { DialogBody, DialogContent } from "@/components/dialogs/dialog-content";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useLocale } from "@/lib/i18n";
import type { StrategyMock, StrategyRuleGroup, StrategyRuleOutcome } from "@/lib/tradesync/strategy-center";
import { strategyCenterText } from "@/lib/tradesync/strategy-center-i18n";
import { STRATEGY_TAG_CATEGORIES, type StrategyTagCategoryId } from "@/lib/tradesync/strategy-tags";

export type StrategyEditorDraft = Pick<StrategyMock, "name" | "description" | "icon" | "color" | "tags" | "groups">;

const COLORS = ["#6B4FC4", "#2E7D6B", "#B4534B", "#3767A5", "#8A6A3D", "#6A5A8C"];

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function emptyDraft(): StrategyEditorDraft {
  return {
    name: "",
    description: "",
    icon: "ST",
    color: COLORS[0],
    tags: {
      traderTypes: [],
      technicalDirections: [],
      marketTypes: [],
    },
    groups: [],
  };
}

export function StrategyEditorDialog({
  open,
  onOpenChange,
  strategy,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  strategy?: StrategyMock | null;
  onSave: (draft: StrategyEditorDraft) => void;
}) {
  const locale = useLocale();
  const t = strategyCenterText[locale];
  const [draft, setDraft] = useState<StrategyEditorDraft>(emptyDraft);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setDraft(
      strategy
        ? {
            name: strategy.name,
            description: strategy.description,
            icon: strategy.icon,
            color: strategy.color,
            tags: structuredClone(strategy.tags),
            groups: structuredClone(strategy.groups),
          }
        : emptyDraft(),
    );
  }, [open, strategy]);

  const updateGroup = (groupId: string, patch: Partial<StrategyRuleGroup>) => {
    setDraft((current) => ({
      ...current,
      groups: current.groups.map((group) => (group.id === groupId ? { ...group, ...patch } : group)),
    }));
  };

  const save = () => {
    if (!draft.name.trim()) {
      setError(t.strategyName);
      return;
    }
    onSave({
      ...draft,
      name: draft.name.trim(),
      description: draft.description.trim(),
      icon: draft.icon.trim().slice(0, 4) || "ST",
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{strategy ? t.editStrategy : t.createStrategy}</DialogTitle>
          <DialogDescription>{t.mockNotice}</DialogDescription>
        </DialogHeader>
        <DialogBody className="max-h-[calc(100dvh-13rem)] space-y-6">
          <section className="space-y-4">
            <h3 className="font-semibold text-sm">{t.generalInfo}</h3>
            <div className="grid gap-4 md:grid-cols-[1fr_10rem]">
              <div className="space-y-2">
                <Label htmlFor="strategy-name">{t.strategyName}</Label>
                <Input
                  id="strategy-name"
                  value={draft.name}
                  onChange={(event) => {
                    setError("");
                    setDraft({ ...draft, name: event.target.value });
                  }}
                  placeholder={t.strategyName}
                  aria-invalid={Boolean(error)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="strategy-icon">{t.icon}</Label>
                <Input
                  id="strategy-icon"
                  value={draft.icon}
                  maxLength={4}
                  onChange={(event) => setDraft({ ...draft, icon: event.target.value.toUpperCase() })}
                  placeholder="ST"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="strategy-description">{t.strategyDescription}</Label>
              <Textarea
                id="strategy-description"
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                placeholder={t.strategyDescription}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>{t.color}</Label>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((color) => (
                  <Button
                    key={color}
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={color}
                    aria-pressed={draft.color === color}
                    className={draft.color === color ? "ring-2 ring-ring ring-offset-2" : ""}
                    onClick={() => setDraft({ ...draft, color })}
                  >
                    <span className="size-4 rounded-full" style={{ backgroundColor: color }} />
                  </Button>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="font-semibold text-sm">标签</h3>
            <div className="grid gap-4 lg:grid-cols-3">
              {STRATEGY_TAG_CATEGORIES.map((category) => (
                <div key={category.id} className="space-y-2 rounded-lg border p-3">
                  <Label className="font-medium">{category.labels[locale]}</Label>
                  <div className="flex flex-wrap gap-x-3 gap-y-2">
                    {category.options.map((tag) => {
                      const selected = draft.tags[category.id].includes(tag.id);
                      return (
                        <Label key={tag.id} className="flex cursor-pointer items-center gap-2 font-normal text-sm">
                          <Checkbox
                            checked={selected}
                            onCheckedChange={(checked) =>
                              setDraft((current) => ({
                                ...current,
                                tags: {
                                  ...current.tags,
                                  [category.id]: checked
                                    ? [...current.tags[category.id], tag.id]
                                    : current.tags[category.id].filter((id) => id !== tag.id),
                                } satisfies Record<StrategyTagCategoryId, string[]>,
                              }))
                            }
                          />
                          {tag.labels[locale]}
                        </Label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold text-sm">{t.rules}</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    groups: [...current.groups, { id: uid("group"), name: t.groupName, rules: [] }],
                  }))
                }
              >
                <Plus />
                {t.addRuleGroup}
              </Button>
            </div>

            {draft.groups.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
                {t.noRules}
              </div>
            ) : (
              <div className="space-y-4">
                {draft.groups.map((group) => (
                  <div key={group.id} className="rounded-lg border bg-card p-4">
                    <div className="flex items-center gap-2">
                      <GripVertical className="size-4 text-muted-foreground" aria-hidden="true" />
                      <Input
                        value={group.name}
                        onChange={(event) => updateGroup(group.id, { name: event.target.value })}
                        placeholder={t.groupName}
                        className="font-semibold"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t.remove}
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            groups: current.groups.filter((item) => item.id !== group.id),
                          }))
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    <div className="mt-3 space-y-2">
                      {group.rules.map((rule) => (
                        <div
                          key={rule.id}
                          className="grid gap-2 rounded-md bg-muted/35 p-2 md:grid-cols-[1fr_10rem_auto_auto]"
                        >
                          <Input
                            value={rule.name}
                            onChange={(event) =>
                              updateGroup(group.id, {
                                rules: group.rules.map((item) =>
                                  item.id === rule.id ? { ...item, name: event.target.value } : item,
                                ),
                              })
                            }
                            placeholder={t.ruleName}
                          />
                          <Select
                            value={rule.outcome}
                            onValueChange={(value) =>
                              updateGroup(group.id, {
                                rules: group.rules.map((item) =>
                                  item.id === rule.id ? { ...item, outcome: value as StrategyRuleOutcome } : item,
                                ),
                              })
                            }
                          >
                            <SelectTrigger aria-label={t.outcome}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="always">{t.always}</SelectItem>
                              <SelectItem value="winner">{t.winner}</SelectItem>
                              <SelectItem value="loser">{t.loser}</SelectItem>
                              <SelectItem value="breakeven">{t.breakeven}</SelectItem>
                            </SelectContent>
                          </Select>
                          <Label className="flex items-center gap-2 whitespace-nowrap">
                            <Checkbox
                              checked={rule.critical}
                              onCheckedChange={(checked) =>
                                updateGroup(group.id, {
                                  rules: group.rules.map((item) =>
                                    item.id === rule.id ? { ...item, critical: checked === true } : item,
                                  ),
                                })
                              }
                            />
                            {t.critical}
                          </Label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t.remove}
                            onClick={() =>
                              updateGroup(group.id, {
                                rules: group.rules.filter((item) => item.id !== rule.id),
                              })
                            }
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={() =>
                        updateGroup(group.id, {
                          rules: [
                            ...group.rules,
                            {
                              id: uid("rule"),
                              name: "",
                              outcome: "always",
                              critical: false,
                            },
                          ],
                        })
                      }
                    >
                      <Plus />
                      {t.addRule}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.cancel}
          </Button>
          <Button onClick={save}>{t.saveStrategy}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
