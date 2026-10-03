# Development

Setup lokal, menjalankan aplikasi, dan menjalankan test.

## Clone

```sh
git clone https://github.com/Putrabadiws/Audify-priv.git Audify
cd Audify
```

Yang **tidak** ada di repo (dibuat lokal): `backend/.venv`, `frontend/node_modules`, `backend/data/` (DB + media), `backend/.env`, `spike/.venv`, `spike/samples/`, `spike/results/`.

## Prasyarat

- macOS / Linux, **Python 3.12** (`brew install python@3.12`), **Node 20+**
- **ffmpeg** (`brew install ffmpeg`) — konversi audio untuk player & durasi
- RAM ≥ 8 GB (model turbo ≈ 1.9 GB saat jalan)
- Internet sekali di awal: model Whisper large-v3-turbo (~1.6 GB) diunduh otomatis dari Hugging Face saat job pertama
- **Ollama** untuk AI summary (opsional — transkripsi tetap jalan tanpa ini):
  ```sh
  brew install ollama
  ollama pull qwen3.5:4b        # ~3.4 GB, sekali saja
  ```

## Menjalankan (development)

Tiga terminal (yang ketiga hanya untuk AI summary):

```sh
# 0) Ollama — harus jalan sebelum klik "Generate summary" (tidak auto-start setelah restart Mac)
ollama serve

# 1) backend — http://127.0.0.1:8000  (docs API: /docs)
cd backend
/opt/homebrew/bin/python3.12 -m venv .venv      # sekali saja
.venv/bin/pip install -r requirements.txt        # sekali saja
.venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# 2) frontend — http://localhost:5173
cd frontend
npm install                                      # sekali saja
npm run dev
```

Buka **http://localhost:5173**. Vite mem-proxy `/api` ke backend, jadi tidak perlu setting CORS.

**Port bentrok** (mis. project Laravel lain memakai 8000/5173): jalankan di port lain dan arahkan proxy ke backend:

```sh
.venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8010                 # backend
AUDIFY_BACKEND_URL=http://127.0.0.1:8010 npx vite --host 127.0.0.1 --port 5180 --strictPort  # frontend
```

## Test

```sh
cd backend  && .venv/bin/python -m pytest       # 79 test (butuh ffmpeg; Ollama tidak diperlukan)
cd frontend && npm test && npm run typecheck && npm run lint
```

Test backend memakai transcriber palsu — tidak mengunduh model.

---

[← Indeks dokumentasi](../README.md)
