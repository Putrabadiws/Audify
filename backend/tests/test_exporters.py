import json

import pytest

from app.schemas.job import ExportFormat
from app.services.exporters import (
    ExportSegment,
    attachment_header,
    format_timestamp,
    render_export,
)

SEGMENTS = [
    ExportSegment(0.0, 1.5, "Selamat pagi."),
    ExportSegment(1.5, 3661.25, "Budget naik 20%."),
]


@pytest.mark.parametrize(
    ("seconds", "sep", "with_hours", "expected"),
    [
        (0, ",", True, "00:00:00,000"),
        (1.5, ",", True, "00:00:01,500"),
        (3661.25, ".", True, "01:01:01.250"),
        (65, ",", False, "01:05"),
        (3661, ",", False, "1:01:01"),
        (-2, ",", True, "00:00:00,000"),  # negative timings from the model clamp to zero
        (0.9996, ",", True, "00:00:01,000"),  # rounding carries into seconds
    ],
)
def test_format_timestamp(seconds: float, sep: str, with_hours: bool, expected: str) -> None:
    assert format_timestamp(seconds, sep, with_hours) == expected


def test_srt_is_numbered_with_comma_millis() -> None:
    out = render_export(ExportFormat.SRT, "t", SEGMENTS)
    assert out.startswith("1\n00:00:00,000 --> 00:00:01,500\nSelamat pagi.\n")
    assert "2\n00:00:01,500 --> 01:01:01,250\nBudget naik 20%.\n" in out


def test_vtt_has_header_and_dot_millis() -> None:
    out = render_export(ExportFormat.VTT, "t", SEGMENTS)
    assert out.startswith("WEBVTT\n\n00:00:00.000 --> 00:00:01.500\n")


def test_txt_with_and_without_timestamps() -> None:
    assert render_export(ExportFormat.TXT, "t", SEGMENTS, timestamps=True).splitlines() == [
        "[00:00] Selamat pagi.",
        "[00:01] Budget naik 20%.",
    ]
    assert render_export(ExportFormat.TXT, "t", SEGMENTS, timestamps=False) == (
        "Selamat pagi. Budget naik 20%.\n"
    )


def test_md_has_title() -> None:
    out = render_export(ExportFormat.MD, "Rapat Q4", SEGMENTS)
    assert out.startswith("# Rapat Q4\n\n**00:00** Selamat pagi.")


def test_json_keeps_unicode_and_structure() -> None:
    data = json.loads(render_export(ExportFormat.JSON, "Rapat", SEGMENTS))
    assert data["title"] == "Rapat"
    assert data["segments"][1] == {"start": 1.5, "end": 3661.25, "text": "Budget naik 20%."}


def test_empty_transcript_exports_without_crashing() -> None:
    for fmt in ExportFormat:
        assert isinstance(render_export(fmt, "empty", []), str)


@pytest.mark.parametrize(
    ("filename", "fallback"),
    [
        ("a-b_c (1).txt", "a-b_c (1).txt"),  # already safe: untouched
        ("Rapat.Q4.final.srt", "Rapat.Q4.final.srt"),  # inner dots kept
        ("Café – Q4.txt", "Cafe  Q4.txt"),  # accents folded; en dash has no ASCII form, dropped
        ("会議.txt", "transcript.txt"),  # nothing ASCII left
        ('a"b;c\\d\r\nX: y.md', "a_b_c_d__X_ y.md"),  # header-breaking chars neutralised
    ],
)
def test_attachment_header_ascii_fallback(filename: str, fallback: str) -> None:
    header = attachment_header(filename)
    assert header.startswith(f'attachment; filename="{fallback}"; ')
    header.encode("latin-1")  # must never raise: Starlette encodes headers as latin-1


def test_attachment_header_keeps_exact_name_in_rfc5987_param() -> None:
    assert attachment_header("会議 Q4.txt").endswith("filename*=UTF-8''%E4%BC%9A%E8%AD%B0%20Q4.txt")
