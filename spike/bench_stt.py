"""Benchmark local STT engines on one audio file.

Usage: .venv/bin/python bench_stt.py <audio> [--ref ref.json] [--configs name,...]

Reports per config: load time, transcribe time, real-time factor (RTF = proc_time / audio_dur,
<1 = faster than real time), peak RSS, WER vs reference (if given), and writes the transcript
JSON to results/. Each config runs in a fresh subprocess so peak memory is per-engine
(8 GB machine — engines must not share one process).
"""
import argparse
import json
import re
import resource
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent
RESULTS = HERE / "results"

# name -> (engine, model, language). language None = auto-detect.
CONFIGS = {
    "mlx-turbo-auto": ("mlx", "mlx-community/whisper-large-v3-turbo", None),
    "mlx-turbo-id": ("mlx", "mlx-community/whisper-large-v3-turbo", "id"),
    "fw-turbo-auto": ("fw", "large-v3-turbo", None),
    "fw-turbo-id": ("fw", "large-v3-turbo", "id"),
    "fw-small-id": ("fw", "small", "id"),
}
# Custom vocabulary via initial_prompt — cheap accuracy win for brand/jargon.
PROMPT = "Rapat marketing Chitato. Budget, campaign, engagement rate, TikTok, Instagram Reels, cost per acquisition."


def audio_duration(path: str) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "csv=p=0", path], capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


def normalize(text: str) -> list[str]:
    text = text.lower()
    text = re.sub(r"[^\w\s%-]", " ", text)
    return text.split()


def wer(ref: str, hyp: str) -> float:
    """Word error rate via Levenshtein distance over normalized word lists."""
    r, h = normalize(ref), normalize(hyp)
    if not r:
        return 0.0 if not h else 1.0
    prev = list(range(len(h) + 1))
    for i, rw in enumerate(r, 1):
        cur = [i] + [0] * len(h)
        for j, hw in enumerate(h, 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (rw != hw))
        prev = cur
    return prev[-1] / len(r)


def run_one(name: str, audio: str) -> dict:
    """Runs inside a child process: load + transcribe one config."""
    engine, model, lang = CONFIGS[name]
    t0 = time.perf_counter()
    if engine == "mlx":
        import mlx_whisper
        # mlx_whisper loads lazily inside transcribe(); warm-up on 1s of silence to split load vs run
        import numpy as np
        mlx_whisper.transcribe(np.zeros(16000, dtype=np.float32), path_or_hf_repo=model)
        t1 = time.perf_counter()
        res = mlx_whisper.transcribe(audio, path_or_hf_repo=model, language=lang,
                                     word_timestamps=True, initial_prompt=PROMPT)
        segs = [{"start": s["start"], "end": s["end"], "text": s["text"].strip()} for s in res["segments"]]
        detected = res.get("language")
    else:
        from faster_whisper import WhisperModel
        # int8 on CPU: CTranslate2 has no Metal backend, int8 halves RAM vs float32
        m = WhisperModel(model, device="cpu", compute_type="int8")
        t1 = time.perf_counter()
        it, info = m.transcribe(audio, language=lang, word_timestamps=True, initial_prompt=PROMPT,
                                vad_filter=True)
        segs = [{"start": s.start, "end": s.end, "text": s.text.strip()} for s in it]
        detected = info.language
    t2 = time.perf_counter()
    # ru_maxrss is bytes on macOS
    peak_mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024 / 1024
    return {"config": name, "load_s": t1 - t0, "run_s": t2 - t1, "peak_mb": peak_mb,
            "detected_language": detected, "text": " ".join(s["text"] for s in segs), "segments": segs}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("--ref")
    ap.add_argument("--configs", default=",".join(CONFIGS))
    ap.add_argument("--child", help=argparse.SUPPRESS)
    args = ap.parse_args()

    if args.child:
        print(json.dumps(run_one(args.child, args.audio)))
        return

    RESULTS.mkdir(exist_ok=True)
    dur = audio_duration(args.audio)
    ref = json.loads(Path(args.ref).read_text())["text"] if args.ref else None
    stem = Path(args.audio).stem
    rows = []
    for name in args.configs.split(","):
        p = subprocess.run([sys.executable, __file__, args.audio, "--child", name],
                           capture_output=True, text=True)
        if p.returncode != 0:
            print(f"[{name}] FAILED\n{p.stderr[-2000:]}", file=sys.stderr)
            continue
        r = json.loads(p.stdout.strip().splitlines()[-1])
        r["rtf"] = r["run_s"] / dur
        r["wer"] = wer(ref, r["text"]) if ref else None
        (RESULTS / f"{stem}.{name}.json").write_text(json.dumps(r, ensure_ascii=False, indent=2))
        rows.append(r)
        print(f"[{name}] done: run {r['run_s']:.1f}s", file=sys.stderr)

    print(f"\naudio: {args.audio} ({dur:.1f}s)")
    print(f"{'config':<16}{'load_s':>8}{'run_s':>8}{'RTF':>7}{'peakMB':>8}{'lang':>6}{'WER':>7}")
    for r in rows:
        w = f"{r['wer']:.1%}" if r["wer"] is not None else "-"
        print(f"{r['config']:<16}{r['load_s']:>8.1f}{r['run_s']:>8.1f}{r['rtf']:>7.2f}"
              f"{r['peak_mb']:>8.0f}{str(r['detected_language']):>6}{w:>7}")


if __name__ == "__main__":
    main()
