# Alur data

Sequence diagram alur utama: upload → transkrip, AI summary, playback/video, dan search.

## 1. Upload → transkrip

```mermaid
sequenceDiagram
    actor U as User
    participant FE as React
    participant API as FastAPI
    participant W as Worker thread
    participant FF as ffmpeg
    participant WH as faster-whisper
    participant DB as SQLite

    U->>FE: drop / pilih file / rekam mic
    FE->>API: POST /api/v1/jobs (multipart: file, language, vocabulary)
    API->>API: cek ekstensi (415 jika tidak didukung)
    API->>DB: INSERT job (status=queued)
    API->>API: simpan media/<id>/original.<ext>
    API->>W: enqueue(TRANSCRIBE, id)
    API-->>FE: 201 job
    loop tiap 2 detik selama queued/processing
        FE->>API: GET /api/v1/jobs/{id}
    end
    W->>DB: status=processing
    W->>FF: original → playback.m4a (AAC mono)
    W->>FF: ffprobe durasi
    W->>DB: duration (player bisa dipakai sejak sini)
    W->>WH: transcribe(original, language, prompt = vocab global + vocab job)
    WH-->>W: segmen + word timestamps (progress per segmen)
    W->>DB: progress (hanya jika naik ≥1%)
    W->>DB: replace segments, status=done
```

- Gagal di langkah mana pun → `status=failed` + pesan error; bisa *Re-transcribe*.
- Backend restart di tengah job → job `processing` di-requeue otomatis saat start.
- *Vocabulary* masuk sebagai `initial_prompt` Whisper (maks ~800 karakter; bagian akhir/vocab job diprioritaskan).

## 2. AI Summary

```mermaid
sequenceDiagram
    participant FE as React
    participant API as FastAPI
    participant W as Worker thread
    participant S as Summarizer
    participant O as Ollama (qwen3.5:4b)

    FE->>API: POST /api/v1/jobs/{id}/summary
    API->>W: enqueue(SUMMARIZE, id)
    API-->>FE: 202 (status=queued)
    loop tiap 3 detik
        FE->>API: GET /api/v1/jobs/{id}/summary
    end
    W->>S: segmen transkrip
    alt transkrip ≤ 10.000 karakter
        S->>O: 1 call → notulen final
    else lebih panjang
        S->>O: map: 1 call per chunk (dipotong di batas segmen)
        S->>O: reduce: gabung catatan (dipadatkan berpasangan jika masih panjang)
    end
    O-->>S: Markdown
    S-->>W: notulen
    W->>W: simpan content, status=done
```

- `num_ctx=8192`, `think=false` (thinking menggandakan waktu tanpa gain), `keep_alive=2m` → model dilepas dari RAM supaya Whisper kebagian.
- Hasil bisa diedit (`PUT .../summary`, ditandai `edited`); *Regenerate* minta konfirmasi kalau sudah diedit.

## 3. Playback & video preview

- Audio: `GET /jobs/{id}/media` → `playback.m4a` (format yang bisa diputar semua browser), mendukung HTTP Range untuk seek.
- Video: `GET /jobs/{id}` mengembalikan `has_video` (ffprobe: ada stream video **bukan** `attached_pic`; hasil di-cache per file). Jika `true`, frontend memutar `GET /jobs/{id}/video` = file asli tanpa re-encode.
- Browser tidak bisa decode (event `error`, atau `videoWidth = 0`) → frontend otomatis pindah ke `<audio>`.
- Klik segmen → `seek(start)`; segmen aktif di-highlight dari `currentTime` media.

## 4. Search

`GET /jobs?q=` → `LIKE` case-insensitive di judul **dan** teks segmen (karakter `%`, `_`, `\` di-escape). Respons berisi cuplikan + timestamp (maks 3 per job); klik cuplikan membuka `/jobs/{id}?t=<detik>`.

---

[← Indeks dokumentasi](../README.md)
