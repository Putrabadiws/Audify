"""Generate a synthetic ID+EN code-switching meeting sample with `say` + ffmpeg.

Synthetic TTS is only a smoke test for speed/pipeline — real meeting audio is still
needed to judge accuracy (TTS is far cleaner than real mics/overlap).
"""
import json
import subprocess
from pathlib import Path

OUT = Path(__file__).parent / "samples"
OUT.mkdir(exist_ok=True)

# (voice, text) — Damayanti = id_ID, Samantha/Daniel = en; mixed lines use the Indonesian
# voice because real code-switching comes from Indonesian speakers.
LINES = [
    ("Damayanti", "Selamat pagi semua. Hari ini kita bahas budget marketing untuk kuartal empat."),
    ("Daniel", "Before we start, can everyone see the dashboard on the screen?"),
    ("Damayanti", "Iya, kelihatan. Jadi campaign Chitato bulan lalu engagement rate-nya naik dua puluh persen."),
    ("Samantha", "That's great. I think we should allocate more budget to TikTok and Instagram Reels."),
    ("Damayanti", "Setuju, tapi kita perlu cek dulu cost per acquisition-nya, jangan sampai over budget."),
    ("Daniel", "Okay. Action item: I will prepare the proposal by Friday."),
    ("Damayanti", "Oke, nanti kita meeting lagi minggu depan untuk final review. Terima kasih semuanya."),
]


def main():
    parts = []
    for i, (voice, text) in enumerate(LINES):
        aiff = OUT / f"part{i}.aiff"
        subprocess.run(["say", "-v", voice, "-o", str(aiff), text], check=True)
        parts.append(aiff)
    # concat with 0.6s silence between turns, resample to 16 kHz mono (Whisper native rate)
    inputs, filters = [], []
    for i, p in enumerate(parts):
        inputs += ["-i", str(p)]
        filters.append(f"[{i}:a]aresample=16000,apad=pad_dur=0.6[a{i}]")
    concat = "".join(f"[a{i}]" for i in range(len(parts)))
    fc = ";".join(filters) + f";{concat}concat=n={len(parts)}:v=0:a=1[out]"
    wav = OUT / "mixed-id-en.wav"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", fc,
                    "-map", "[out]", "-ac", "1", "-ar", "16000", str(wav)], check=True)
    for p in parts:
        p.unlink()
    (OUT / "mixed-id-en.ref.json").write_text(json.dumps(
        {"text": " ".join(t for _, t in LINES), "turns": [{"voice": v, "text": t} for v, t in LINES]},
        ensure_ascii=False, indent=2))
    print(wav)


if __name__ == "__main__":
    main()
