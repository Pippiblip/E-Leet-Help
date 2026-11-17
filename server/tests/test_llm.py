import json
from types import SimpleNamespace

from server.app import create_app
from server import llm
from server.schema import AnalyzeRequest, AnalyzeResponse


def test_groq_request_uses_json_output_without_sampling_controls():
    app = create_app({
        "TESTING": True,
        "GROQ_API_KEY": "test-key",
        "LLM_MODEL": "llama-3.3-70b-versatile",
        "LOW_SCORE_THRESHOLD": 5,
        "RATE_PER_INSTALL": "20 per hour;60 per day",
        "RATE_PER_IP": "60 per hour",
        "RATELIMIT_STORAGE_URI": "memory://",
    })
    captured = {}
    response = AnalyzeResponse.model_validate({
        "rubric_version": "v1",
        "scores": {"quality": 7, "readability": 8, "concept": 6},
        "complexity": {"time": "O(n^2)", "space": "O(1)"},
        "suggested": {"approach": "Hash map", "time": "O(n)", "space": "O(n)"},
        "concepts": ["Hash Table"],
        "hint": None,
    })

    def create(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=response.model_dump_json()), finish_reason="stop")],
            usage=SimpleNamespace(prompt_tokens=400, completion_tokens=100),
        )

    app.extensions["groq_client"] = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    payload = {
        "install_id": "3f2b8c1e-8d0a-4b6e-9a57-1c2d3e4f5a6b",
        "submission_id": "2196513173",
        "slug": "two-sum",
        "title": "Two Sum",
        "difficulty": "Easy",
        "topic_tags": ["Array"],
        "lang": "cpp",
        "code": "class Solution {}",
        "verdict": {},
        "history": [],
    }
    request = AnalyzeRequest.model_validate(payload)
    with app.app_context():
        outcome = llm.analyze(request)

    assert outcome.response == response
    assert outcome.input_tokens == 400
    assert captured["model"] == "llama-3.3-70b-versatile"
    assert captured["response_format"] == {"type": "json_object"}
    assert not {"temperature", "top_p", "top_k"}.intersection(captured)
    user_data = json.loads(captured["messages"][1]["content"])
    assert "install_id" not in user_data
    assert user_data["code"] == payload["code"]
    assert user_data["low_score_threshold"] == 5
