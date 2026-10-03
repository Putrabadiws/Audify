# Spike — STT lokal gratis (ID + EN)

Tujuan: membuktikan pipeline transkripsi self-hosted gratis layak di mesin dev (Apple A18 Pro, 8 GB RAM) sebelum menulis kode aplikasi.

## Setup

```sh
brew install ffmpeg
/opt/homebrew/bin/python3.12 -m venv .venv   # venv terpisah: venv bersama masih Python 3.9
.venv/bin/pip install faster-whisper mlx-whisper
.venv/bin/python make_sample.py               # audio sintetis ID+EN + teks referensi
.venv/bin/python bench_stt.py samples/mixed-id-en.wav --ref samples/mixed-id-en.ref.json
```

`bench_stt.py` menjalankan tiap konfigurasi di subprocess terpisah (peak RAM per engine), menulis transkrip ke `results/`.

## Hasil — 2026-09-27, sample sintetis 42 detik (`say`: Damayanti id_ID + Samantha/Daniel en)

| Config | Run (s) | RTF | Peak RAM | WER | Catatan |
|---|---|---|---|---|---|
| mlx-whisper turbo, auto | 12.2 | 0.29 | n/a* | 26.4% | **Menerjemahkan kalimat Inggris ke Indonesia** |
| mlx-whisper turbo, `id` | 10.0 | 0.24 | n/a* | 26.4% | Sama; `condition_on_previous_text=False` juga tidak membantu |
| faster-whisper turbo int8 CPU, auto | 30.4 | 0.72 | 1.8 GB | 5.7% | Deteksi `id`, bahasa Inggris tetap Inggris |
| **faster-whisper turbo int8 CPU, `id`** | 21.9 | 0.52 | 1.8 GB | 5.7% | **Terbaik** |
| faster-whisper small, `id` | 9.0 | 0.21 | 1.3 GB | 18.4% | Satu kalimat hilang ("Action item: I will prepare…") |

\* mlx memakai unified memory GPU, tidak terhitung di RSS — angka peak tidak valid.
Load time pertama (~200 s) = download model, dikecualikan dari tabel.

Sisa WER faster-whisper turbo hampir semua dari **format angka** (`4` vs "empat", `20%` vs "dua puluh persen", "Oke" vs "Okay"), bukan salah dengar. Akurasi efektif pada sample ini ≈ sempurna.

## Hasil — audio asli (2026-09-27)

**Sumber:** [Creative Commons Indonesia Podcast #1](https://commons.wikimedia.org/wiki/File:Creative_Commons_Indonesia_-_Podcast_-1_-_Celebration_of_Freedom_of_Sharing_in_Indonesia.ogg) (CC BY-SA 4.0, 63 menit, diskusi multi-speaker bahasa Indonesia, direkam di venue dengan noise ruangan). Cuplikan menit 5–15 → `samples/cc-id-10min.wav`. Tidak ada teks referensi → WER tidak dihitung, akurasi dinilai manual.

| Config | Run (s) | RTF | Peak RAM |
|---|---|---|---|
| fw-turbo-id | 395.9 | 0.66 | 1.86 GB |
| fw-turbo-auto | 413.7 | 0.69 | 1.86 GB |

- Audio asli lebih lambat dari sintetis (RTF 0.66 vs 0.52) → **1 jam audio ≈ 40 menit proses**.
- Output kedua config identik (auto-detect juga memilih `id`).
- Percakapan santai terbaca, tapi **istilah domain salah dengar** jika `initial_prompt` tidak relevan: "hak cipta" → "cinta sendiri", "hak moral" → "hampu orang".
- Tes 90 detik: `initial_prompt` berisi istilah topik ("hak cipta, hak moral, pencipta, …") → istilah itu **benar semua**. Prompt yang salah topik (kosakata Chitato) tidak membantu.
- Halusinasi: 1 baris pendek berulang ("Oh iya.") — ringan, VAD aktif.

**Audio non-speech** (2 video musik di `~/Downloads`): dengan VAD → transkrip kosong (benar). Tanpa VAD → Whisper **berhalusinasi** ("Hey! Hey!", "Terima kasih."). VAD wajib.

## Kesimpulan sementara

- **Engine: faster-whisper large-v3-turbo, int8, CPU, `language="id"`, `vad_filter=True`, `word_timestamps=True`, `initial_prompt` berisi kosakata brand.**
- RTF 0.52 (sintetis) – 0.66 (asli) → audio 1 jam ≈ 30–40 menit proses. Cukup untuk antrean background, bukan real-time.
- **Kosakata kustom (`initial_prompt`) per job/global wajib jadi fitur** — dampaknya besar pada istilah domain.
- mlx-whisper 2× lebih cepat tapi **tidak aman untuk code-switching** — ditolak.
- RAM 1.8 GB → muat di 8 GB, masih ada ruang untuk pyannote (dijalankan setelahnya, bukan bersamaan).

## Belum terbukti (wajib sebelum commit)

1. **Audio meeting internal asli dengan code-switching ID+EN** — podcast CC di atas hampir murni bahasa Indonesia; kasus campur bahasa baru teruji di audio sintetis.
2. **Diarization pyannote** — butuh token Hugging Face + accept terms model `pyannote/speaker-diarization-community-1` (atau 3.1).
4. Normalisasi angka (`20%` ↔ "dua puluh persen") perlu diputuskan: biarkan (lebih mudah dibaca) atau normalisasi saat hitung WER.

## LLM lokal untuk summary — 2026-09-29

`backend/.venv/bin/python spike/bench_llm.py <model> spike/results/cc-id-10min.fw-turbo-id.json` (lewat `Summarizer` asli Audify, Ollama 0.34.4, `think=false`, `num_ctx=8192`).

| Model | Ukuran | Waktu (10 menit audio, 2 chunk) | Hasil |
|---|---|---|---|
| **qwen3.5:4b** | 3.4 GB | **248 s** | Struktur rapi, bahasa Indonesia natural, action item masuk akal → **dipilih** |
| qwen3:4b | 2.5 GB | >20 menit, dihentikan | Terlalu lambat di mesin ini — model dihapus |

Rekaman pendek 42 detik: 26–40 s. Catatan:
- Kesalahan fakta di ringkasan podcast ("hak ekonomi … selamanya") berasal dari **ASR** ("hak moral" terdengar "hampu orang"), bukan LLM → vocabulary kustom lebih penting daripada model yang lebih besar.
- Model 4B mengisi PIC placeholder ("Speaker") saat nama tidak disebut; aturan saja tidak cukup, **contoh few-shot** di prompt memperbaikinya.
