# Model data

Skema SQLite dan layout penyimpanan media per job.


SQLite `backend/data/audify.db`, dibuat dengan `create_all` (belum ada migrasi).

```mermaid
erDiagram
    JOB ||--o{ SEGMENT : has
    JOB ||--o| SUMMARY : has
    JOB }o--o{ TAG : job_tags
    JOB {
        string id PK "uuid4"
        string title
        string original_filename
        string media_ext
        enum status "queued|processing|done|failed"
        float progress
        text error
        string language "null = auto"
        string detected_language
        text vocabulary
        string model
        float duration
        datetime created_at "UTC"
        datetime updated_at "UTC"
    }
    SEGMENT {
        int id PK
        string job_id FK
        int idx
        float start
        float end
        text text
        json words "word timestamps + probability"
    }
    SUMMARY {
        string job_id PK
        enum status
        float progress
        text content "Markdown"
        text error
        string model
        bool edited
    }
    TAG {
        int id PK
        string name "unik, maks 50"
    }
    APP_SETTING {
        string key PK "mis. global vocabulary"
        text value
    }
```

Media per job: `backend/data/media/<job_id>/original.<ext>` (upload asli) + `playback.m4a`. Hapus job = hapus folder ini.

---

[← Indeks dokumentasi](../README.md)
