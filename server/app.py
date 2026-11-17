from __future__ import annotations

import hashlib
import time
from uuid import UUID, uuid4

from flask import Flask, current_app, jsonify, request
from flask_limiter.errors import RateLimitExceeded
from flask_limiter.util import get_remote_address
from pydantic import ValidationError
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.middleware.proxy_fix import ProxyFix

from . import llm
from .config import Config
from .limits import (
    install_day_limit,
    install_hour_limit,
    install_key,
    ip_hour_limit,
    limiter,
)
from .prompts import RUBRIC_VERSION
from .schema import AnalyzeRequest, AnalyzeResponse


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def _rate_limits(value: str) -> tuple[str, str]:
    parts = [part.strip() for part in value.split(";")]
    if len(parts) != 2 or not all(parts):
        raise ValueError("RATE_PER_INSTALL must contain hourly and daily limits separated by a semicolon.")
    return parts[0], parts[1]


def create_app(overrides: dict | None = None) -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config)
    if overrides:
        app.config.update(overrides)
    if not 0 <= int(app.config["LOW_SCORE_THRESHOLD"]) <= 10:
        raise ValueError("LOW_SCORE_THRESHOLD must be from 0 to 10.")
    app.config["RATE_PER_INSTALL_HOURLY"], app.config["RATE_PER_INSTALL_DAILY"] = _rate_limits(
        app.config["RATE_PER_INSTALL"]
    )
    app.config["MAX_CONTENT_LENGTH"] = int(app.config["MAX_CONTENT_LENGTH"])
    app.config["DEBUG"] = False

    if app.config["TRUST_PROXY"]:
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)
    app.extensions["groq_client"] = llm.create_client(
        app.config["GROQ_API_KEY"],
        app.config["LLM_TIMEOUT_S"],
    )
    limiter.init_app(app)

    @app.get("/healthz")
    def healthz():
        return jsonify({"ok": True}), 200

    @app.errorhandler(RequestEntityTooLarge)
    def too_large(_error):
        return _error_response(413, "payload_too_large", "The request body is too large.")

    @app.errorhandler(RateLimitExceeded)
    def rate_limited(_error):
        return _error_response(429, "rate_limited", "The analysis rate limit was reached. Try again later.")

    @app.errorhandler(Exception)
    def unexpected(_error):
        current_app.logger.error("Unhandled server error request_id=%s", getattr(request, "request_id", "unknown"))
        return _error_response(500, "server_error", "The server could not complete the request.")

    @app.post("/api/v1/analyze")
    @limiter.limit(install_hour_limit, key_func=install_key)
    @limiter.limit(install_day_limit, key_func=install_key)
    @limiter.limit(ip_hour_limit, key_func=get_remote_address)
    def analyze():
        started = time.monotonic()
        request_id = str(uuid4())
        request.request_id = request_id
        raw_install_id = request.headers.get("X-Install-Id", "")
        install_hash = hashlib.sha256(raw_install_id.encode("utf-8")).hexdigest()[:16]
        slug = "unknown"
        language = "unknown"
        code_length = 0
        input_tokens = None
        output_tokens = None
        error_code = "server_error"
        status = 500
        model = app.config["LLM_MODEL"]

        try:
            if request.mimetype != "application/json":
                raise ApiError(400, "bad_request", "Content-Type must be application/json.")
            raw_body = request.get_data(cache=False)
            if len(raw_body) > app.config["MAX_CONTENT_LENGTH"]:
                raise ApiError(413, "payload_too_large", "The request body is too large.")
            try:
                body = AnalyzeRequest.model_validate_json(raw_body)
            except ValidationError as exc:
                raise ApiError(400, "bad_request", "The analysis request is invalid.") from exc

            slug = body.slug
            language = body.lang
            code_length = len(body.code)
            if code_length > app.config["MAX_CODE_CHARS"]:
                raise ApiError(413, "payload_too_large", "The submitted code exceeds the configured size limit.")
            try:
                header_id = UUID(raw_install_id)
            except (ValueError, AttributeError) as exc:
                raise ApiError(400, "bad_request", "X-Install-Id must be a UUID.") from exc
            if header_id != body.install_id:
                raise ApiError(400, "bad_request", "X-Install-Id does not match install_id.")
            if not app.config["RUBRIC_APPROVED"]:
                raise ApiError(
                    503,
                    "rubric_review_required",
                    "The draft scoring rubric must be reviewed and approved before analysis is enabled.",
                )

            try:
                outcome = llm.analyze(body)
            except llm.LLMTimeoutError as exc:
                raise ApiError(504, "llm_timeout", "The model provider timed out. You can retry.") from exc
            except llm.LLMFailedError as exc:
                raise ApiError(502, "llm_failed", "The model provider could not produce a valid analysis.") from exc
            except Exception as exc:
                raise ApiError(502, "llm_failed", "The model provider could not produce a valid analysis.") from exc

            if isinstance(outcome, llm.AnalysisOutcome):
                input_tokens = outcome.input_tokens
                output_tokens = outcome.output_tokens
                output = outcome.response
            else:
                output = outcome
            try:
                result = AnalyzeResponse.model_validate(
                    output.model_dump(mode="json") if isinstance(output, AnalyzeResponse) else output
                )
            except (ValidationError, TypeError, ValueError) as exc:
                raise ApiError(502, "llm_failed", "The model provider returned invalid analysis output.") from exc
            if result.rubric_version != RUBRIC_VERSION:
                raise ApiError(502, "llm_failed", "The model provider returned an unsupported rubric version.")
            lowest_score = min(result.scores.quality, result.scores.readability, result.scores.concept)
            if lowest_score <= app.config["LOW_SCORE_THRESHOLD"] and result.hint is None:
                raise ApiError(502, "llm_failed", "The model provider omitted a required low-score hint.")
            if lowest_score > app.config["LOW_SCORE_THRESHOLD"] and result.hint is not None:
                result = result.model_copy(update={"hint": None})
            status = 200
            error_code = "none"
            return jsonify(result.model_dump(mode="json")), status
        except ApiError as exc:
            status = exc.status
            error_code = exc.code
            return _error_response(status, error_code, exc.message)
        finally:
            latency_ms = round((time.monotonic() - started) * 1000)
            current_app.logger.info(
                "analysis request_id=%s install_id_hash=%s slug=%s lang=%s code_chars=%d "
                "model=%s latency_ms=%d input_tokens=%s output_tokens=%s status=%d error_code=%s",
                request_id,
                install_hash,
                slug,
                language,
                code_length,
                model,
                latency_ms,
                input_tokens,
                output_tokens,
                status,
                error_code,
            )

    return app


def _error_response(status: int, code: str, message: str):
    return jsonify({"error": {"code": code, "message": message}}), status


app = create_app()