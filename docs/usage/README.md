# Cara pakai

Panduan pemakaian aplikasi dari sisi user.


Tampilan: sidebar (Dashboard · All files · Tags), toolbar (search global, tema terang/gelap, ⚙ Settings). Tema *Auto* mengikuti macOS; ubah di ⚙ → General → Appearance atau tombol bulan/matahari.

1. **Dashboard** → kartu **Import** (pilih file) atau **Record** (mikrofon; klik lagi untuk *Stop*). Atur *Language* (default *Indonesian + mixed English*) dan *Vocabulary for new files* di bawah kartu — pilihan ini diingat dan juga dipakai saat **drop file di mana saja** di aplikasi.
   - Rekaman butuh `localhost` atau HTTPS (aturan browser untuk akses mic). Chrome/Firefox merekam `.webm`, Safari `.m4a`.
   - Kalau browser tidak pernah memunculkan dialog izin mic: cek *System Settings → Privacy & Security → Microphone*.
   - Upload 1 file langsung membuka editornya; beberapa file sekaligus membuka *All files*.
2. Job masuk antrean → status *Transcribing N%*. Kecepatan di MacBook 8 GB: **±30–40 menit per 1 jam audio**. Satu job diproses bergantian (sengaja — RAM).
3. **Editor** (klik file):
   - klik teks / timestamp → audio loncat & play dari situ, segmen aktif di-highlight; hover segmen → tombol ▶ play, salin, edit
   - **double-click** teks (atau ✎) → edit; `Enter` simpan, `Shift+Enter` baris baru, `Esc` batal
   - judul bisa diubah langsung; tag di bawah judul (`Enter`/koma menambah, `Backspace` di input kosong menghapus)
   - **Re-transcribe** → ulang dengan bahasa/vocabulary lain (edit manual akan tertimpa)
   - **Export ▾** → TXT, SRT, VTT, Markdown, JSON (TXT/MD bisa tanpa timestamp)
   - panel kiri (ikon ▯), transkrip di kanan: **AI Summary** | **Info** (durasi, jumlah kata, model, vocabulary, tanggal)
   - **File video** → preview video di atas panel kiri, dikendalikan player bar bawah (klik video = play/pause, klik teks = loncat). File asli diputar apa adanya (tanpa konversi); kalau browser tidak bisa memutar codec-nya (mis. `.mkv` di Safari, HEVC), otomatis kembali ke audio saja. Menyembunyikan panel tidak menghentikan pemutaran.
4. **Search** (kolom di toolbar, dari halaman mana pun) → cari kata di judul **dan isi transkrip**. Hasil menampilkan cuplikan + timestamp; klik cuplikan → editor terbuka di detik itu.
5. **Tags** (sidebar) → klik tag untuk memfilter *All files*. Tag tanpa file otomatis hilang.
6. **AI Summary** → *Generate summary* membuat notulen: Ringkasan, Poin Penting, Keputusan, Action Items (checkbox), Pertanyaan Terbuka — dalam bahasa transkrip. Jalan lokal lewat Ollama, tidak ada data keluar. Bisa *Copy*, *Download .md*, *Edit*, *Regenerate* (minta konfirmasi kalau sudah diedit). Waktu: ±30 detik untuk rekaman pendek, ±4 menit per 10 menit audio.
   - Kualitas ringkasan bergantung pada transkrip: istilah yang salah dengar ikut salah di ringkasan → isi *Vocabulary*.
7. **⚙ Settings** (modal) → *General* (tampilan), *Transcription* (global vocabulary, engine), *AI Summary* (status Ollama).

---

[← Indeks dokumentasi](../README.md)
