export const EMOTIONS = {
  calm: "平静", confident: "自信", anxious: "焦虑", fearful: "恐惧", greedy: "贪婪",
  frustrated: "挫败", impulsive: "冲动", tired: "疲劳", other: "其他",
} as const;
export const REVIEW_ERRORS = {
  chasing: "追单", early_entry: "提前入场", overtrading: "过度交易", revenge: "报复性交易",
  oversized: "超仓", no_stop: "未设置止损", moving_stop: "随意移动止损", early_exit: "过早退出",
  late_exit: "拖延退出", plan_deviation: "偏离计划", other: "其他",
} as const;
export type Emotion = keyof typeof EMOTIONS;
export type ReviewError = keyof typeof REVIEW_ERRORS;
export interface ReviewReflection {
  recording_basis: "retrospective";
  emotion_before: Emotion | null;
  emotion_after: Emotion | null;
  emotion_notes: string;
  error_assessment: "unassessed" | "none" | "identified";
  errors: ReviewError[];
  primary_error: ReviewError | null;
  conclusion: string;
  next_action: string;
  no_new_action: boolean;
}

export function reflectionComplete(value: ReviewReflection) {
  return !!value.conclusion.trim() && (!!value.next_action.trim() || value.no_new_action);
}
