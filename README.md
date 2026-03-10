# VinStock v6.0 — Panduan Deploy & Hosting

Sistem Inventaris & Manajemen Stok Medis Real-Time untuk SHE ABN.

---

## 📁 Struktur File

```
vinstock/
├── index.html      ← Aplikasi utama (PWA single-file)
├── manifest.json   ← PWA manifest (install ke HP)
├── sw.js           ← Service Worker (offline + cache)
├── Code.gs         ← Backend Google Apps Script (database)
└── README.md       ← Panduan ini
```

---

## 🚀 CARA DEPLOY (Step by Step)

### LANGKAH 1 — Siapkan Google Spreadsheet

1. Buka [sheets.google.com](https://sheets.google.com)
2. Buat spreadsheet baru → beri nama misalnya **"VinStock Database"**
3. Salin **ID Spreadsheet** dari URL:
   ```
   https://docs.google.com/spreadsheets/d/[INI ADALAH ID ANDA]/edit
   ```

---

### LANGKAH 2 — Setup Google Apps Script

1. Buka [script.google.com](https://script.google.com)
2. Klik **New Project**
3. Hapus semua kode yang ada, paste isi file `Code.gs`
4. Cari baris ini dan isi dengan ID spreadsheet Anda:
   ```javascript
   const SHEET_ID = 'ISI_SHEET_ID_ANDA_DI_SINI';
   ```
5. Simpan (Ctrl+S), beri nama project misalnya **"VinStock API"**
6. Klik **Run ▶** → pilih fungsi `initSheets` → klik **Run**
   - Ini akan membuat 5 sheet otomatis: `obat`, `apd`, `aset`, `log`, `_meta`
   - Lakukan **HANYA SEKALI**

---

### LANGKAH 3 — Deploy sebagai Web App

1. Di editor Apps Script, klik **Deploy** → **New deployment**
2. Klik ikon ⚙️ → pilih **Web app**
3. Isi konfigurasi:
   - **Description**: VinStock API v3
   - **Execute as**: Me
   - **Who has access**: **Anyone** ← WAJIB
4. Klik **Deploy**
5. **Salin URL** yang muncul (bentuknya seperti):
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```

---

### LANGKAH 4 — Hosting Frontend

#### Opsi A: Netlify (Gratis, Direkomendasikan)

1. Buka [netlify.com](https://netlify.com) → Sign Up gratis
2. Klik **Add new site** → **Deploy manually**
3. Drag & drop **folder `vinstock`** ke area upload
4. Selesai! Anda mendapat URL seperti `https://vinstock-abc.netlify.app`

#### Opsi B: Vercel (Gratis)

1. Buka [vercel.com](https://vercel.com) → Sign Up
2. Klik **Add New → Project**
3. Upload atau link ke repo GitHub yang berisi folder `vinstock`
4. Deploy → URL otomatis tersedia

#### Opsi C: GitHub Pages (Gratis)

1. Buat repo baru di [github.com](https://github.com)
2. Upload semua file ke repo
3. Settings → Pages → Source: main branch → Save
4. URL: `https://[username].github.io/[repo-name]/`

#### Opsi D: Gunakan Langsung (tanpa hosting)

- Buka `index.html` langsung di browser
- Bagikan file ke rekan — buka dari folder lokal
- **Catatan**: Service Worker tidak aktif jika dibuka sebagai `file://`
  - Untuk PWA penuh, gunakan hosting HTTPS

---

### LANGKAH 5 — Hubungkan ke Aplikasi

1. Buka aplikasi VinStock di browser
2. Klik ikon ☁️ di pojok kanan atas
3. Masukkan **URL Google Apps Script** dari Langkah 3
4. (Opsional) Isi nama perangkat
5. Klik **Test Koneksi** → pastikan berhasil
6. Klik **Simpan & Sync**

---

## 📱 Instalasi sebagai Aplikasi HP

### Android (Chrome)
1. Buka URL aplikasi di Chrome
2. Muncul banner "Tambahkan ke Layar Utama" → Tambah
3. Atau: Menu Chrome (⋮) → **Tambahkan ke layar utama**

### iOS (Safari)
1. Buka URL di Safari
2. Tombol Share (⬆) → **Tambahkan ke Layar Utama**
3. Klik Tambah

---

## 👥 Multi-User Setup

Untuk menggunakan di beberapa perangkat:

1. Deploy `Code.gs` hanya **sekali** (satu Google Spreadsheet)
2. Bagikan link aplikasi ke semua pengguna
3. Setiap pengguna input URL GAS yang **sama** di pengaturan ☁️
4. Data akan tersinkron otomatis antar perangkat

---

## ⚙️ Fitur Teknis

| Fitur | Implementasi |
|-------|-------------|
| Offline Storage | localStorage + IndexedDB |
| Real-time Sync | Polling adaptif (3-8 detik) + Push immediate |
| Background Sync | Service Worker Background Sync API |
| Conflict Resolution | Timestamp-based (terbaru menang) |
| Cache Strategy | Cache-First (assets) + Network-First (HTML) |
| PWA | manifest.json + Service Worker + HTTPS |
| Export | CSV (per kategori) + JSON backup |
| Error Recovery | Exponential backoff retry (2s, 4s, 8s, 16s) |

---

## 🔧 Troubleshooting

**"Gagal terhubung" saat Test Koneksi:**
- Pastikan GAS di-deploy dengan "Who has access: **Anyone**" (bukan "Anyone with Google account")
- Buka URL GAS langsung di browser — harusnya muncul JSON
- Coba deploy ulang GAS dengan deployment baru

**Data tidak sync ke perangkat lain:**
- Pastikan semua perangkat menggunakan URL GAS yang sama
- Klik ↺ Sync untuk force sync manual
- Periksa koneksi internet

**Service Worker tidak aktif:**
- Aplikasi harus diakses via HTTPS (bukan `http://` atau `file://`)
- Gunakan hosting seperti Netlify/Vercel/GitHub Pages

**IndexedDB error:**
- Biasanya terjadi di mode incognito — data tetap tersimpan di localStorage

---

## 📊 Database Schema (Google Sheets)

### Sheet: obat / apd / aset
| Kolom | Tipe | Keterangan |
|-------|------|-----------|
| id | string | UUID unik |
| kode | string | Kode barang (OBT-001) |
| nama | string | Nama barang |
| merek | string | Merek/jenis |
| satuan | string | Tablet/Box/Unit |
| stok | number | Stok saat ini |
| stokAwal | number | Stok awal |
| masuk | number | Total masuk |
| keluar | number | Total keluar |
| min | number | Stok minimum |
| harga | number | Harga satuan |
| exp | string | Tanggal kadaluarsa |
| lokasi | string | Lokasi penyimpanan |
| ket | string | Keterangan |
| createdAt | timestamp | Waktu dibuat |
| updatedAt | timestamp | Waktu diupdate |
| _deleted | 0/1 | Soft delete flag |

### Sheet: log
| Kolom | Tipe | Keterangan |
|-------|------|-----------|
| id | string | UUID unik |
| cat | string | obat/apd/aset |
| itemId | string | ID barang |
| itemNama | string | Nama barang |
| type | string | masuk/keluar |
| qty | number | Jumlah |
| petugas | string | Nama petugas |
| jabatan | string | Jabatan |
| ket | string | Keterangan |
| tgl | string | Tanggal (YYYY-MM-DD) |
| jam | string | Jam (HH:MM) |
| ts | timestamp | Unix timestamp |
| device | string | Nama perangkat |

---

## 📞 Dukungan

Untuk pertanyaan seputar instalasi dan konfigurasi, lihat bagian Troubleshooting di atas atau periksa kembali setiap langkah setup.
