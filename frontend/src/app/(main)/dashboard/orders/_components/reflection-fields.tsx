"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { EMOTIONS, REVIEW_ERRORS, type Emotion, type ReviewError, type ReviewReflection } from "@/lib/tradesync/reflection";

export function ReflectionFields({ value, onChange, disabled }: {
  value: ReviewReflection; onChange: (value: ReviewReflection) => void; disabled: boolean;
}) {
  const change = (patch: Partial<ReviewReflection>) => onChange({ ...value, ...patch });
  return <FieldGroup>
    <FieldSet disabled={disabled}>
      <FieldLegend>情绪回顾</FieldLegend>
      <p className="text-muted-foreground text-xs">以下为事后回忆与主观自评，不代表交易当时已有记录；不根据盈亏自动判断情绪或错误。</p>
      <FieldGroup className="grid gap-3 sm:grid-cols-2">
        {(["emotion_before", "emotion_after"] as const).map((key) => <Field key={key}>
          <FieldLabel htmlFor={`reflection-${key}`}>{key === "emotion_before" ? "入场前情绪" : "退出后情绪"}</FieldLabel>
          <NativeSelect id={`reflection-${key}`} value={value[key] ?? ""} onChange={(e) => change({ [key]: (e.target.value || null) as Emotion | null })}>
            <NativeSelectOption value="">未记录／无法回忆</NativeSelectOption>
            {Object.entries(EMOTIONS).map(([code, label]) => <NativeSelectOption key={code} value={code}>{label}</NativeSelectOption>)}
          </NativeSelect>
        </Field>)}
      </FieldGroup>
      <Field><FieldLabel htmlFor="reflection-emotion-notes">情绪说明（可选）</FieldLabel>
        <Textarea id="reflection-emotion-notes" rows={3} maxLength={2000} value={value.emotion_notes} onChange={(e) => change({ emotion_notes: e.target.value })} />
      </Field>
    </FieldSet>
    <FieldSet disabled={disabled}>
      <FieldLegend>执行错误自评</FieldLegend>
      <Field><FieldLabel htmlFor="reflection-error-assessment">是否发现执行错误</FieldLabel>
        <NativeSelect id="reflection-error-assessment" value={value.error_assessment} onChange={(e) => {
          const assessment = e.target.value as ReviewReflection["error_assessment"];
          change({ error_assessment: assessment, ...(assessment !== "identified" ? { errors: [], primary_error: null } : {}) });
        }}><NativeSelectOption value="unassessed">尚未评估</NativeSelectOption><NativeSelectOption value="none">未发现错误</NativeSelectOption><NativeSelectOption value="identified">存在错误</NativeSelectOption></NativeSelect>
      </Field>
      {value.error_assessment === "identified" && <>
        <FieldSet><FieldLegend variant="label">错误分类（可多选）</FieldLegend><FieldGroup className="grid gap-3 sm:grid-cols-2">
          {Object.entries(REVIEW_ERRORS).map(([code, label]) => <Field key={code} orientation="horizontal">
            <Checkbox id={`reflection-error-${code}`} disabled={disabled} checked={value.errors.includes(code as ReviewError)} onCheckedChange={(checked) => {
              const errors = checked === true ? [...value.errors, code as ReviewError] : value.errors.filter((item) => item !== code);
              change({ errors, primary_error: value.primary_error && errors.includes(value.primary_error) ? value.primary_error : null });
            }} /><FieldLabel htmlFor={`reflection-error-${code}`}>{label}</FieldLabel>
          </Field>)}
        </FieldGroup></FieldSet>
        <Field><FieldLabel htmlFor="reflection-primary-error">主要错误（最多一项）</FieldLabel>
          <NativeSelect id="reflection-primary-error" value={value.primary_error ?? ""} onChange={(e) => change({ primary_error: (e.target.value || null) as ReviewError | null })}>
            <NativeSelectOption value="">暂不指定</NativeSelectOption>
            {value.errors.map((code) => <NativeSelectOption key={code} value={code}>{REVIEW_ERRORS[code]}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
      </>}
    </FieldSet>
    <FieldSet disabled={disabled}>
      <FieldLegend>结论与改进</FieldLegend>
      <p className="text-muted-foreground text-xs">提交“已复盘”需填写结论，并填写行动或明确无需新增行动。草稿可暂不填写；此处不会创建提醒或计划任务。</p>
      <Field><FieldLabel htmlFor="reflection-conclusion">复盘结论</FieldLabel>
        <Textarea id="reflection-conclusion" rows={3} maxLength={2000} value={value.conclusion} placeholder="哪些行为应保留，主要问题是什么？" onChange={(e) => change({ conclusion: e.target.value })} />
      </Field>
      <Field><FieldLabel htmlFor="reflection-next-action">下次行动</FieldLabel>
        <Textarea id="reflection-next-action" rows={3} maxLength={2000} disabled={disabled || value.no_new_action} value={value.next_action} placeholder="下次交易准备如何调整？" onChange={(e) => change({ next_action: e.target.value })} />
      </Field>
      <Field orientation="horizontal"><Checkbox id="reflection-no-action" disabled={disabled} checked={value.no_new_action} onCheckedChange={(checked) => {
        if (checked === true && value.next_action.trim() && !window.confirm("选择无需新增行动将清空已填写的下次行动，确定继续吗？")) return;
        change({ no_new_action: checked === true, next_action: checked === true ? "" : value.next_action });
      }} /><FieldLabel htmlFor="reflection-no-action">继续执行现有规则，无需新增行动</FieldLabel></Field>
    </FieldSet>
  </FieldGroup>;
}
