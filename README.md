# Audify

Web app transkripsi audio/video (Indonesia + Inggris). Semua komponen gratis & jalan lokal: tidak ada API berbayar.

Masalah yang diselesaikan: rekaman meeting yang panjang susah direkap. Alurnya: upload/rekam → transkrip otomatis (Whisper) → notulen otomatis (LLM lokal) → edit, cari, export.

## Fitur

- Upload file audio/video (drag & drop di mana saja) atau rekam langsung dari mikrofon browser
- Transkripsi lokal **faster-whisper large-v3-turbo** — akurat untuk campuran Indonesia + Inggris, dengan *vocabulary* global & per file
- Editor transkrip: klik teks → audio loncat, edit per segmen, re-transcribe, preview video
- **AI Summary** (notulen: Ringkasan, Poin Penting, Keputusan, Action Items, Pertanyaan Terbuka) lewat **Ollama** `qwen3.5:4b` — data tidak keluar dari mesin
- Search judul + isi transkrip, tag, export TXT / SRT / VTT / Markdown / JSON
- Tema terang/gelap

## Tech stack

| Lapisan | Teknologi |
|---|---|
| **Speech-to-text** | Whisper large-v3-turbo via **faster-whisper** 1.2 (CTranslate2, `int8`, CPU, VAD Silero) |
| **AI summary** | **Ollama** 0.34 + **Qwen 3.5 4B** (`qwen3.5:4b`, Metal GPU) — map-reduce untuk transkrip panjang |
| **Media** | ffmpeg / ffprobe 9.0 — transcode audio playback, durasi, deteksi video |
| **Backend** | Python 3.12 · **FastAPI** 0.141 + Uvicorn · SQLAlchemy 2.1 · **SQLite** (WAL) · Pydantic 2 · httpx |
| **Frontend** | **React** 19 · **Vite** 8 · TypeScript 6 · TanStack React Query 5 · React Router 7 · zod 4 · react-markdown · lucide-react · CSS Modules |
| **Test & lint** | pytest + ruff (backend) · Vitest + Testing Library + oxlint (frontend) |

Semua open-source dan jalan lokal — tanpa API berbayar. Detail versi & peran tiap komponen: [docs/architecture](docs/architecture/README.md#tech-stack).

## Struktur repo

| Folder | Isi |
|---|---|
| `backend/` | FastAPI + SQLite + faster-whisper (worker thread) |
| `frontend/` | React + Vite + TypeScript + React Query |
| `spike/` | Benchmark engine STT & LLM (lihat `spike/README.md` — alasan pemilihan model) |
| `docs/` | Dokumentasi lengkap — [indeks](docs/README.md) |

## Quick start

Prasyarat: Python 3.12, Node 20+, ffmpeg, Ollama (opsional, untuk AI summary). Detail: [docs/development](docs/development/README.md).

```sh
git clone https://github.com/Putrabadiws/Audify-priv.git Audify && cd Audify

# 0) Ollama (AI summary) — sekali: brew install ollama && ollama pull qwen3.5:4b
ollama serve

# 1) backend — http://127.0.0.1:8000  (docs API: /docs)
cd backend
/opt/homebrew/bin/python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# 2) frontend — http://localhost:5173
cd frontend && npm install && npm run dev
```

Port 8000/5173 sudah dipakai project lain? Lihat [port bentrok](docs/development/README.md#menjalankan-development).

## Dokumentasi

| Topik | Isi |
|---|---|
| [Arsitektur](docs/architecture/README.md) | Tech stack, komponen, infrastruktur, keputusan desain |
| [Alur data](docs/data-flows/README.md) | Upload → transkrip, AI summary, playback, search |
| [Model data](docs/database/README.md) | Skema SQLite & penyimpanan media |
| [API](docs/api/README.md) | REST API `/api/v1` |
| [Konfigurasi](docs/configuration/README.md) | Environment variable `AUDIFY_*` |
| [Development](docs/development/README.md) | Setup, menjalankan, test |
| [Cara pakai](docs/usage/README.md) | Panduan user |
| [Troubleshooting](docs/troubleshooting/README.md) | Masalah umum |

## Batasan MVP (belum ada)

- Diarization (siapa bicara) — perlu pyannote + token Hugging Face
- AI chat (tanya-jawab tentang transkrip), prompt summary yang bisa diubah di Settings
- Live transcription (teks muncul saat merekam), terjemahan
- Auth / multi-user — saat ini single-user lokal, **jangan expose ke internet**
- Migrasi DB (Alembic) — skema dibuat `create_all`; tambahkan Alembic sebelum ada data yang harus dipertahankan
- Transkripsi di GPU Apple — butuh ganti engine (whisper.cpp / mlx) + benchmark ulang code-switching
