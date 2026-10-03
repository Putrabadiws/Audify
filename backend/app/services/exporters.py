import json
import re
import unicodedata
from dataclasses import dataclass
from urllib.parse import quote

from app.schemas.job import ExportFormat


@dataclass
class ExportSegment:
    start: float
    end: float
    text: str


def format_timestamp(seconds: float, sep: str = ",", with_hours: bool = True) -> str:
    """SRT uses 00:00:01,500; VTT uses 00:00:01.500; plain text uses 00:01."""
    total_ms = max(0, round(seconds * 1000))
    hours, rem = divmod(total_ms, 3_600_000)
    minutes, rem = divmod(rem, 60_000)
    secs, ms = divmod(rem, 1000)
    if not with_hours:
        # human-readable short form for TXT/MD: mm:ss, or h:mm:ss past an hour
        return f"{hours}:{minutes:02d}:{secs:02d}" if hours else f"{minutes:02d}:{secs:02d}"
    return f"{hours:02d}:{minutes:02d}:{secs:02d}{sep}{ms:03d}"


def _to_txt(title: str, segments: list[ExportSegment], timestamps: bool) -> str:
    if not timestamps:
        return " ".join(s.text for s in segments).strip() + "\n"
    lines = [f"[{format_timestamp(s.start, with_hours=False)}] {s.text}" for s in segments]
    return "\n".join(lines) + "\n"


def _to_srt(segments: list[ExportSegment]) -> str:
    blocks = [
        f"{i}\n{format_timestamp(s.start)} --> {format_timestamp(s.end)}\n{s.text}\n"
        for i, s in enumerate(segments, 1)
    ]
    return "\n".join(blocks)


def _to_vtt(segments: list[ExportSegment]) -> str:
    blocks = [
        f"{format_timestamp(s.start, '.')} --> {format_timestamp(s.end, '.')}\n{s.text}\n"
        for s in segments
    ]
    return "WEBVTT\n\n" + "\n".join(blocks)


def _to_md(title: str, segments: list[ExportSegment], timestamps: bool) -> str:
    body = (
        "\n\n".join(f"**{format_timestamp(s.start, with_hours=False)}** {s.text}" for s in segments)
        if timestamps
        else " ".join(s.text for s in segments)
    )
    return f"# {title}\n\n{body}\n"


def _to_json(title: str, segments: list[ExportSegment]) -> str:
    data = {
        "title": title,
        "segments": [{"start": s.start, "end": s.end, "text": s.text} for s in segments],
    }
    return json.dumps(data, ensure_ascii=False, indent=2) + "\n"


MEDIA_TYPES: dict[ExportFormat, str] = {
    ExportFormat.TXT: "text/plain; charset=utf-8",
    ExportFormat.SRT: "application/x-subrip; charset=utf-8",
    ExportFormat.VTT: "text/vtt; charset=utf-8",
    ExportFormat.MD: "text/markdown; charset=utf-8",
    ExportFormat.JSON: "application/json; charset=utf-8",
}


def render_export(
    fmt: ExportFormat, title: str, segments: list[ExportSegment], timestamps: bool = True
) -> str:
    match fmt:
        case ExportFormat.TXT:
            return _to_txt(title, segments, timestamps)
        case ExportFormat.SRT:
            return _to_srt(segments)
        case ExportFormat.VTT:
            return _to_vtt(segments)
        case ExportFormat.MD:
            return _to_md(title, segments, timestamps)
        case ExportFormat.JSON:
            return _to_json(title, segments)


# Whitelist, not blacklist: anything outside it (quotes, CR/LF, ";", "\\", non-ASCII) becomes "_",
# so a user-chosen title can never break out of the header or trip latin-1 encoding.
_UNSAFE_FILENAME_CHARS = re.compile(r"[^A-Za-z0-9 ._()\-]")


def attachment_header(filename: str) -> str:
    """Content-Disposition for any Unicode filename (RFC 6266 + RFC 5987).

    Starlette encodes headers as latin-1, so the raw title can't go in `filename=`.
    Browsers use `filename*` (exact UTF-8 name); `filename` is an ASCII fallback.
    """
    ascii_name = unicodedata.normalize("NFKD", filename).encode("ascii", "ignore").decode()
    ascii_name = _UNSAFE_FILENAME_CHARS.sub("_", ascii_name).strip()
    # an all-non-ASCII title ("会議.txt") leaves just ".txt": give the fallback a real stem
    if not ascii_name or ascii_name.startswith("."):
        ascii_name = "transcript" + ascii_name
    return f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename, safe='')}"
