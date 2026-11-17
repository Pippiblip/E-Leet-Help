from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from flask import current_app
from groq import APIConnectionError, APITimeoutError, Groq
from pydantic import ValidationError

from .prompts import RUBRIC_VERSION, SYSTEM_PROMPT
from .schema import AnalyzeRequest, AnalyzeResponse


class LLMTimeoutError(Exception):
    pass


class LLMFailedError(Exception):
    pass


@dataclass(frozen=True)
class AnalysisOutcome:
    response: AnalyzeResponse
    input_tokens: int | None
    output_tokens: int | None


def create_client(api_key: str, timeout_s: int) -> Groq | None:
    if not api_key:
        return None
    return Groq(api_key=api_key, timeout=timeout_s, max_retries=0)


def analyze(request: AnalyzeRequest) -> AnalysisOutcome:
    client: Groq | None = current_app.extensions.get("groq_client")
    if client is None:
        raise LLMFailedError("The analysis provider is not configured.")
    data = request.model_dump(mode="json", exclude={"install_id"})
    data["rubric_version"] = RUBRIC_VERSION
    data["low_score_threshold"] = current_app.config["LOW_SCORE_THRESHOLD"]
    try:
        completion = client.chat.completions.create(
            model=current_app.config["LLM_MODEL"],
            max_tokens=current_app.config["LLM_MAX_TOKENS"],
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": json.dumps(data, ensure_ascii=False)},
            ],
            response_format={"type": "json_object"},
        )
    except APITimeoutError as exc:
        raise LLMTimeoutError from exc
    except APIConnectionError as exc:
        raise LLMFailedError from exc
    except Exception as exc:
        raise LLMFailedError from exc

    choice = completion.choices[0] if getattr(completion, "choices", None) else None
    if choice is None:
        raise LLMFailedError("The provider returned no analysis choice.")
    finish_reason = getattr(choice, "finish_reason", None)
    if finish_reason == "length":
        raise LLMFailedError("The model response exceeded its output limit.")

    text = getattr(choice.message, "content", None)
    if not isinstance(text, str):
        raise LLMFailedError("The provider returned no analysis text.")

    try:
        result = AnalyzeResponse.model_validate_json(text)
    except ValidationError as exc:
        raise LLMFailedError("The provider returned invalid analysis output.") from exc

    if result.rubric_version != RUBRIC_VERSION:
        raise LLMFailedError("The provider returned an unsupported rubric version.")
    lowest_score = min(result.scores.quality, result.scores.readability, result.scores.concept)
    threshold = current_app.config["LOW_SCORE_THRESHOLD"]
    if lowest_score <= threshold and result.hint is None:
        raise LLMFailedError("The provider omitted a required low-score hint.")
    if lowest_score > threshold and result.hint is not None:
        result = result.model_copy(update={"hint": None})

    usage = getattr(completion, "usage", None)
    return AnalysisOutcome(
        response=result,
        input_tokens=getattr(usage, "prompt_tokens", None),
        output_tokens=getattr(usage, "completion_tokens", None),
    )
