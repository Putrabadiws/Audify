# API

Referensi REST API backend (FastAPI).


Base `/api/v1`. Dokumentasi interaktif: `http://127.0.0.1:8000/docs`.

| Method | Path | Fungsi |
|---|---|---|
| `GET` | `/jobs?q=&tag=` | List job terbaru dulu; filter tag, search judul + transkrip |
| `POST` | `/jobs` | Upload (multipart `file`, `language`, `vocabulary`) → 201; 415 jika format tidak didukung |
| `GET` | `/jobs/{id}` | Detail + segmen + `has_video` |
| `PATCH` | `/jobs/{id}` | Ganti judul |
| `PUT` | `/jobs/{id}/tags` | Set tag (maks 20) |
| `DELETE` | `/jobs/{id}` | Hapus job + media (409 jika sedang diproses) |
| `POST` | `/jobs/{id}/transcribe` | Re-transcribe dengan bahasa/vocabulary lain |
| `PATCH` | `/jobs/{id}/segments/{segment_id}` | Edit teks segmen |
| `GET` | `/jobs/{id}/media` | Stream audio playback (Range) |
| `GET` | `/jobs/{id}/video` | Stream video asli (Range); 404 jika bukan video |
| `GET` | `/jobs/{id}/export?format=&timestamps=` | Download `txt` / `srt` / `vtt` / `md` / `json` |
| `GET` | `/jobs/{id}/summary` | Status + isi notulen |
| `POST` | `/jobs/{id}/summary` | Generate/regenerate notulen → 202 |
| `PUT` | `/jobs/{id}/summary` | Simpan notulen hasil edit |
| `GET` | `/tags` | Tag + jumlah file |
| `GET` / `PUT` | `/settings` | Global vocabulary, bahasa default |
| `GET` | `/ai/status` | Ollama terjangkau? model terpasang? |
| `GET` | `/health` | Health check (di luar `/api/v1`) |

Format didukung: `.mp3 .m4a .wav .ogg .oga .opus .flac .aac .webm .mp4 .mov .mkv .m4v`.

---

[← Indeks dokumentasi](../README.md)
