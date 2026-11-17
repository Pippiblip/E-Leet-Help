import logging

import pytest

from server import llm
from server.app import create_app
from server.schema import AnalyzeResponse


INSTALL_ID = "3f2b8c1e-8d0a-4b6e-9a57-1c2d3e4f5a6b"
CODE = "class Solution { return twoSum(nums, target); }"


def valid_request():
    return {
        "install_id": INSTALL_ID,
        "submission_id": "2196513173",
        "slug": "two-sum",
        "title": "Two Sum",
        "difficulty": "Easy",
        "topic_tags": ["Array", "Hash Table"],
        "lang": "cpp",
        "code": CODE,
        "verdict": {
            "status_runtime": "364 ms",
            "status_memory": "402.3 MB",
            "runtime_percentile": 11.07,
            "memory_percentile": 5.03,
            "total_correct": 953,
            "total_testcases": 953,
        },
        "history": [],
    }


def valid_response():
    return AnalyzeResponse.model_validate({
        "rubric_version": "v1",
        "scores": {"quality": 7, "readability": 8, "concept": 6},
        "complexity": {"time": "O(n^2)", "space": "O(1)"},
        "suggested": {
            "approach": "Single pass with a hash map",
            "time": "O(n)",
            "space": "O(n)",
        },
        "concepts": ["Hash Table", "Complement lookup"],
        "hint": None,
    })


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(
        llm,
        "analyze",
        lambda _request: llm.AnalysisOutcome(valid_response(), 1200, 180),
    )
    app = create_app({
        "TESTING": True,
        "ANTHROPIC_API_KEY": "",
        "RUBRIC_APPROVED": True,
        "RATE_PER_INSTALL": "20 per hour;60 per day",
        "RATE_PER_IP": "60 per hour",
        "RATELIMIT_STORAGE_URI": "memory://",
    })
    return app.test_client()


def headers():
    return {"Content-Type": "application/json", "X-Install-Id": INSTALL_ID}


def post(client, payload=None):
    return client.post("/api/v1/analyze", json=payload or valid_request(), headers=headers())


def test_health_and_valid_analysis(client):
    health = client.get("/healthz")
    assert health.status_code == 200
    assert health.json == {"ok": True}

    response = post(client)
    assert response.status_code == 200
    assert response.json["scores"]["quality"] == 7
    assert response.json["rubric_version"] == "v1"
    assert "install_id" not in response.json


@pytest.mark.parametrize("mutation", ["missing", "unknown", "invalid_uuid"])
def test_invalid_requests_are_rejected(client, mutation):
    payload = valid_request()
    if mutation == "missing":
        payload.pop("title")
    elif mutation == "unknown":
        payload["extra"] = "not allowed"
    else:
        payload["install_id"] = "not-a-uuid"
    response = post(client, payload)
    assert response.status_code == 400
    assert response.json["error"]["code"] == "bad_request"


def test_code_over_configured_limit_is_rejected():
    app = create_app({
        "TESTING": True,
        "RUBRIC_APPROVED": True,
        "MAX_CODE_CHARS": 8,
        "RATE_PER_INSTALL": "20 per hour;60 per day",
        "RATE_PER_IP": "60 per hour",
        "RATELIMIT_STORAGE_URI": "memory://",
    })
    response = app.test_client().post(
        "/api/v1/analyze",
        json=valid_request(),
        headers=headers(),
    )
    assert response.status_code == 413
    assert response.json["error"]["code"] == "payload_too_large"


def test_rubric_requires_approval(client):
    from server.app import create_app as new_app

    app = new_app({
        "TESTING": True,
        "RUBRIC_APPROVED": False,
        "RATE_PER_INSTALL": "20 per hour;60 per day",
        "RATE_PER_IP": "60 per hour",
        "RATELIMIT_STORAGE_URI": "memory://",
    })
    response = app.test_client().post(
        "/api/v1/analyze",
        json=valid_request(),
        headers=headers(),
    )
    assert response.status_code == 503
    assert response.json["error"]["code"] == "rubric_review_required"


def test_llm_timeout_is_504(client, monkeypatch):
    def timeout(_request):
        raise llm.LLMTimeoutError

    monkeypatch.setattr(llm, "analyze", timeout)
    response = post(client)
    assert response.status_code == 504
    assert response.json["error"]["code"] == "llm_timeout"


def test_llm_exception_and_invalid_output_are_502(client, monkeypatch):
    monkeypatch.setattr(llm, "analyze", lambda _request: (_ for _ in ()).throw(RuntimeError("private")))
    response = post(client)
    assert response.status_code == 502
    assert response.json["error"]["code"] == "llm_failed"
    assert "private" not in response.text

    monkeypatch.setattr(llm, "analyze", lambda _request: {"scores": {}})
    response = post(client)
    assert response.status_code == 502
    assert response.json["error"]["code"] == "llm_failed"


def test_rate_limit_is_applied(client):
    response = None
    for _ in range(21):
        response = post(client)
    assert response is not None
    assert response.status_code == 429
    assert response.json["error"]["code"] == "rate_limited"


def test_logs_never_include_submitted_code(client, caplog):
    payload = valid_request()
    payload["code"] = "SECRET_SOURCE_CODE_DO_NOT_LOG"
    with caplog.at_level(logging.INFO):
        response = post(client, payload)
    assert response.status_code == 200
    assert "SECRET_SOURCE_CODE_DO_NOT_LOG" not in caplog.text
    assert "code_chars=" in caplog.text


def test_wrong_content_type_is_400(client):
    response = client.post("/api/v1/analyze", data="{}", headers={"X-Install-Id": INSTALL_ID})
    assert response.status_code == 400
    assert response.json["error"]["code"] == "bad_request"
