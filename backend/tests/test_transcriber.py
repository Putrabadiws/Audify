from app.services.job_service import normalize_language
from app.services.transcriber import MAX_PROMPT_CHARS, build_prompt


def test_build_prompt_merges_global_then_job() -> None:
    assert build_prompt("Chitato, TikTok", "hak cipta") == "Chitato, TikTok, hak cipta"


def test_build_prompt_empty_returns_none() -> None:
    assert build_prompt("", "") is None
    assert build_prompt("   ", "\n") is None


def test_build_prompt_single_side() -> None:
    assert build_prompt("", "hak moral") == "hak moral"
    assert build_prompt("Chitato", "") == "Chitato"


def test_build_prompt_truncates_keeping_job_terms() -> None:
    prompt = build_prompt("x" * 2000, "hak cipta")
    assert prompt is not None
    assert len(prompt) == MAX_PROMPT_CHARS
    assert prompt.endswith("hak cipta")


def test_normalize_language() -> None:
    assert normalize_language(None, "id") == "id"
    assert normalize_language("", "id") == "id"
    assert normalize_language("auto", "id") is None
    assert normalize_language("en", "id") == "en"
