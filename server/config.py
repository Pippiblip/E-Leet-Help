import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))


def _integer(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        parsed = int(value)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer.") from exc
    if parsed <= 0:
        raise ValueError(f"{name} must be greater than zero.")
    return parsed


class Config:
    GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
    LLM_MODEL = os.getenv("LLM_MODEL", "llama-3.3-70b-versatile")
    LLM_TIMEOUT_S = min(_integer("LLM_TIMEOUT_S", 18), 18)
    LLM_MAX_TOKENS = _integer("LLM_MAX_TOKENS", 2000)
    MAX_CODE_CHARS = _integer("MAX_CODE_CHARS", 20_000)
    MAX_CONTENT_LENGTH = _integer("MAX_CONTENT_LENGTH", 65_536)
    LOW_SCORE_THRESHOLD = int(os.getenv("LOW_SCORE_THRESHOLD", "5"))
    RATE_PER_INSTALL = os.getenv("RATE_PER_INSTALL", "20 per hour;60 per day")
    RATE_PER_IP = os.getenv("RATE_PER_IP", "60 per hour")
    RATELIMIT_STORAGE_URI = os.getenv("RATELIMIT_STORAGE_URI", "memory://")
    TRUST_PROXY = os.getenv("TRUST_PROXY", "false").strip().lower() == "true"
    RUBRIC_APPROVED = os.getenv("RUBRIC_APPROVED", "false").strip().lower() == "true"
    DEBUG = False

    @classmethod
    def validate(cls) -> None:
        if not 0 <= cls.LOW_SCORE_THRESHOLD <= 10:
            raise ValueError("LOW_SCORE_THRESHOLD must be from 0 to 10.")
