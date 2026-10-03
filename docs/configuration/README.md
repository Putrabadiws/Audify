# Konfigurasi

Variabel environment backend (`backend/.env`, prefix `AUDIFY_`) dan frontend. Dibaca oleh `backend/app/core/config.py` (pydantic-settings).


| Variabel | Default | Keterangan |
|---|---|---|
| `AUDIFY_WHISPER_MODEL` | `large-v3-turbo` | `small` lebih cepat tapi akurasi turun jauh (spike: WER 18% vs 6%) |
| `AUDIFY_WHISPER_DEVICE` | `cpu` | `cuda` hanya untuk GPU NVIDIA; faster-whisper tidak mendukung GPU Apple |
| `AUDIFY_WHISPER_COMPUTE_TYPE` | `int8` | `float32` = RAM 2×, tanpa gain berarti di CPU |
| `AUDIFY_DEFAULT_LANGUAGE` | `id` | dipakai jika upload tanpa bahasa; `auto` = deteksi otomatis |
| `AUDIFY_OLLAMA_URL` | `http://127.0.0.1:11434` | alamat Ollama |
| `AUDIFY_LLM_MODEL` | `qwen3.5:4b` | model Ollama untuk summary (harus sudah `ollama pull`) |
| `AUDIFY_LLM_TIMEOUT_S` | `900` | batas waktu satu call ke Ollama (detik) |
| `AUDIFY_LLM_KEEP_ALIVE` | `2m` | model dilepas dari RAM setelah idle — penting di Mac 8 GB |
| `AUDIFY_DATA_DIR` | `backend/data` | SQLite (`audify.db`) + media per job |
| `AUDIFY_CORS_ORIGINS` | `["http://localhost:5173", "http://127.0.0.1:5173"]` | hanya relevan jika frontend tidak lewat proxy Vite |

Frontend (env saat `vite`): `AUDIFY_BACKEND_URL` (default `http://127.0.0.1:8000`) — target proxy `/api`.

---

[← Indeks dokumentasi](../README.md)
