"""Structured, retrospective self-assessment; never inferred from P&L."""
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Emotion = Literal["calm", "confident", "anxious", "fearful", "greedy", "frustrated", "impulsive", "tired", "other"]
ErrorCode = Literal["chasing", "early_entry", "overtrading", "revenge", "oversized", "no_stop", "moving_stop", "early_exit", "late_exit", "plan_deviation", "other"]


class Reflection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    recording_basis: Literal["retrospective"] = "retrospective"
    emotion_before: Emotion | None = None
    emotion_after: Emotion | None = None
    emotion_notes: str = Field(default="", max_length=2000)
    error_assessment: Literal["unassessed", "none", "identified"] = "unassessed"
    errors: list[ErrorCode] = Field(default_factory=list, max_length=11)
    primary_error: ErrorCode | None = None
    conclusion: str = Field(default="", max_length=2000)
    next_action: str = Field(default="", max_length=2000)
    no_new_action: bool = Field(default=False, strict=True)

    @field_validator("emotion_notes", "conclusion", "next_action")
    @classmethod
    def trim_text(cls, value):
        return value.strip()

    @field_validator("errors")
    @classmethod
    def unique_errors(cls, values):
        return list(dict.fromkeys(values))

    @model_validator(mode="after")
    def consistent_choices(self):
        if self.error_assessment == "identified" and not self.errors:
            raise ValueError("选择存在错误时，请至少选择一项错误分类")
        if self.error_assessment != "identified" and (self.errors or self.primary_error):
            raise ValueError("未评估或未发现错误时，不能同时选择错误分类")
        if self.primary_error and self.primary_error not in self.errors:
            raise ValueError("主要错误必须属于已选择的错误分类")
        if self.no_new_action and self.next_action:
            raise ValueError("无需新增行动与下次行动不能同时填写")
        return self
