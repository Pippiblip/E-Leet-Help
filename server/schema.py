from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr

ComplexityClass = Literal[
    "O(1)",
    "O(log n)",
    "O(n)",
    "O(n log n)",
    "O(n^2)",
    "O(n^3)",
    "O(2^n)",
    "O(n!)",
    "other",
]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)


class Scores(StrictModel):
    quality: Annotated[StrictInt, Field(ge=0, le=10)]
    readability: Annotated[StrictInt, Field(ge=0, le=10)]
    concept: Annotated[StrictInt, Field(ge=0, le=10)]


class Verdict(StrictModel):
    status_runtime: Annotated[StrictStr, Field(max_length=80)] | None = None
    status_memory: Annotated[StrictStr, Field(max_length=80)] | None = None
    runtime_percentile: Annotated[float, Field(ge=0, le=100, allow_inf_nan=False)] | None = None
    memory_percentile: Annotated[float, Field(ge=0, le=100, allow_inf_nan=False)] | None = None
    total_correct: Annotated[StrictInt, Field(ge=0)] | None = None
    total_testcases: Annotated[StrictInt, Field(ge=0)] | None = None


class HistoryItem(StrictModel):
    submission_id: Annotated[StrictStr, Field(min_length=1, max_length=32, pattern=r"^\d+$")]
    scores: Scores
    time_complexity: Annotated[StrictStr, Field(max_length=20)]
    space_complexity: Annotated[StrictStr, Field(max_length=20)]
    rubric_version: Annotated[StrictStr, Field(min_length=1, max_length=20)]


class AnalyzeRequest(StrictModel):
    install_id: UUID
    submission_id: Annotated[StrictStr, Field(min_length=1, max_length=32, pattern=r"^\d+$")]
    slug: Annotated[StrictStr, Field(min_length=1, max_length=120, pattern=r"^[a-z0-9-]+$")]
    title: Annotated[StrictStr, Field(min_length=1, max_length=200)]
    difficulty: Annotated[StrictStr, Field(min_length=1, max_length=40)]
    topic_tags: Annotated[list[Annotated[StrictStr, Field(max_length=80)]], Field(max_length=20)]
    lang: Annotated[StrictStr, Field(min_length=1, max_length=80)]
    code: Annotated[StrictStr, Field(min_length=1, max_length=65_536)]
    verdict: Verdict
    history: Annotated[list[HistoryItem], Field(max_length=3)]


class Complexity(StrictModel):
    time: ComplexityClass
    space: ComplexityClass


class Suggested(Complexity):
    approach: Annotated[StrictStr, Field(min_length=1, max_length=160)]


class AnalyzeResponse(StrictModel):
    rubric_version: Annotated[StrictStr, Field(min_length=1, max_length=20)]
    scores: Scores
    complexity: Complexity
    suggested: Suggested
    concepts: Annotated[list[Annotated[StrictStr, Field(min_length=1, max_length=100)]], Field(max_length=5)]
    hint: Annotated[StrictStr, Field(max_length=400)] | None
