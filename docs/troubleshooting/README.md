# Troubleshooting

Masalah yang sudah pernah ditemui saat development lokal dan cara mengatasinya.

| Gejala | Penyebab | Solusi |
|---|---|---|
| Backend/frontend gagal start: port sudah dipakai | Project lain (mis. Laravel) memakai `8000` / `5173` | Jalankan di port lain (`8010` / `5180`) dan set `AUDIFY_BACKEND_URL` — lihat [Development → port bentrok](../development/README.md#menjalankan-development) |
| `http://127.0.0.1:5180` tidak bisa dibuka, `http://localhost:5180` bisa | `vite` tanpa `--host` hanya listen di `localhost` (bisa IPv6 `::1`) | Buka via `localhost`, atau jalankan `vite --host 127.0.0.1` |
| *Generate summary* gagal / ⚙ → AI Summary menunjukkan Ollama tidak terjangkau | `ollama serve` belum jalan (tidak auto-start setelah restart Mac) atau model belum di-pull | `ollama serve`, lalu `ollama pull qwen3.5:4b`. Cek: `curl http://127.0.0.1:11434/api/tags` |
| Browser tidak memunculkan dialog izin mikrofon | Izin mic diblokir di level OS, atau halaman bukan `localhost`/HTTPS | *System Settings → Privacy & Security → Microphone*; akses lewat `localhost` |
| Video tidak tampil, hanya audio | Browser tidak bisa decode codec file asli (mis. `.mkv` di Safari, HEVC) | Perilaku yang disengaja: frontend otomatis fallback ke `<audio>`. Transkrip tidak terpengaruh |
| Job pertama lama di 0% | Model Whisper large-v3-turbo (~1.6 GB) sedang diunduh dari Hugging Face | Tunggu sekali saja; cache di `~/.cache/huggingface` |
| Ringkasan salah menulis istilah/nama | Transkrip salah dengar → ikut salah di summary | Isi *Vocabulary* (global atau per file) lalu *Re-transcribe* |
| Mac lambat / swap saat transkripsi + summary | RAM 8 GB: Whisper (~1.9 GB) + qwen3.5:4b (~3.8 GB) | Job sudah diproses bergantian; `AUDIFY_LLM_KEEP_ALIVE` pendek (default `2m`) melepas model dari RAM |

## Log

- Backend: stdout uvicorn; setiap request punya `X-Request-ID` di log.
- Ollama: stdout `ollama serve`.
- Health check: `curl http://127.0.0.1:8000/health` (sesuaikan port).

---

[← Indeks dokumentasi](../README.md)
