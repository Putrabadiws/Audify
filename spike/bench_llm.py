"""Benchmark local LLM summaries through Audify's real Summarizer.

Usage (backend venv, from repo root):
  backend/.venv/bin/python spike/bench_llm.py <model> <transcript.json> [--chunk-chars N]
Transcript JSON = spike/results/*.json (has "segments": [{start, text}]).
"""
import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.services.llm import OllamaClient  # noqa: E402
from app.services.summarizer import CHUNK_CHARS, Summarizer, TranscriptLine  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("model")
    ap.add_argument("transcript")
    ap.add_argument("--chunk-chars", type=int, default=CHUNK_CHARS)
    args = ap.parse_args()

    data = json.loads(Path(args.transcript).read_text())
    lines = [TranscriptLine(s["start"], s["text"]) for s in data["segments"]]
    chars = sum(len(ln.text) for ln in lines)

    client = OllamaClient("http://127.0.0.1:11434", args.model, timeout_s=1800, keep_alive="5m")
    t0 = time.perf_counter()
    summary = Summarizer(client, chunk_chars=args.chunk_chars).summarize(
        Path(args.transcript).stem, lines, lambda p: print(f"  progress {p:.0%}", file=sys.stderr)
    )
    elapsed = time.perf_counter() - t0

    out = Path(__file__).parent / "results" / f"{Path(args.transcript).stem}.summary.{args.model.replace(':', '_')}.md"
    out.write_text(summary)
    print(f"model={args.model} transcript_chars={chars} segments={len(lines)} time={elapsed:.1f}s -> {out}")


if __name__ == "__main__":
    main()
