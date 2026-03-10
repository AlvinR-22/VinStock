// ═══════════════════════════════════════════════════════════════════════════
// VinStock — Google Apps Script Backend v3.0
// Real-Time Sync Engine untuk VinStock PWA
//
// CARA SETUP:
// 1. Buka script.google.com → New Project → paste kode ini
// 2. Ganti SHEET_ID di bawah dengan ID Google Spreadsheet Anda
// 3. Jalankan initSheets() SATU KALI untuk membuat sheet
// 4. Deploy → New Deployment → Web App
//    - Execute as: Me
//    - Who has access: Anyone
// 5. Copy URL deployment → paste di VinStock Setup
// ═══════════════════════════════════════════════════════════════════════════

// ───── KONFIGURASI — WAJIB DIISI ──────────────────────────────────────────
const SHEET_ID      = 'ISI_SHEET_ID_ANDA_DI_SINI';
const APP_VERSION   = '3.0';
const MAX_LOG_ROWS  = 5000;  // Batas log agar sheet tidak terlalu besar
const LOCK_TIMEOUT  = 15000; // 15 detik lock timeout untuk concurrent access

// ───── NAMA SHEET ─────────────────────────────────────────────────────────
const SHEET_OBAT  = 'obat';
const SHEET_APD   = 'apd';
const SHEET_ASET  = 'aset';
const SHEET_LOG   = 'log';
const SHEET_META  = '_meta';

// ───── HEADER PER SHEET ───────────────────────────────────────────────────
const HEADERS = {
  obat: ['id','kode','nama','merek','satuan','stok','stokAwal','masuk','keluar','min','harga','exp','lokasi','ket','createdAt','updatedAt','_deleted'],
  apd:  ['id','kode','nama','merek','satuan','stok','stokAwal','masuk','keluar','min','harga','exp','lokasi','ket','createdAt','updatedAt','_deleted'],
  aset: ['id','kode','nama','merek','satuan','stok','stokAwal','masuk','keluar','min','harga','exp','lokasi','ket','createdAt','updatedAt','_deleted'],
  log:  ['id','cat','itemId','itemNama','itemKode','itemSatuan','type','qty','petugas','jabatan','ket','tgl','jam','ts','recordedAt','editedAt','device','_deleted']
};

// ═══════════════════════════════════════════════════════════════════════════
// ENTRY POINTS: doGet & doPost
// ═══════════════════════════════════════════════════════════════════════════

function doGet(e) {
  const params  = e && e.parameter ? e.parameter : {};
  const action  = params.action || 'ping';

  try {
    if (action === 'ping')  return jsonOk(handlePing());
    if (action === 'poll')  return jsonOk(handlePoll(params));
    if (action === 'full')  return jsonOk(handleFullSync());
    return jsonErr('Unknown GET action: ' + action);
  } catch(err) {
    return jsonErr('GET Error: ' + err.message);
  }
}

function doPost(e) {
  try {
    const body   = JSON.parse(e.postData.contents);
    const action = body.action || 'sync';

    if (action === 'sync') return jsonOk(handleSync(body));
    return jsonErr('Unknown POST action: ' + action);
  } catch(err) {
    return jsonErr('POST Error: ' + err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HANDLER: PING
// ═══════════════════════════════════════════════════════════════════════════

function handlePing() {
  const ss = getSpreadsheet();
  return {
    status:    'ok',
    version:   APP_VERSION,
    message:   'VinStock GAS siap',
    sheetName: ss.getName(),
    serverTs:  Date.now()
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HANDLER: POLL (GET — ambil update dari perangkat lain)
// ═══════════════════════════════════════════════════════════════════════════

function handlePoll(params) {
  const since    = parseInt(params.since || '0', 10);
  const device   = params.device || '?';
  const ss       = getSpreadsheet();

  const data = readAllSheets(ss);
  const serverTs = getServerTs(ss);

  // Hanya kirim jika ada data baru sejak "since"
  const hasChanges = since === 0 || serverTs > since;

  return {
    status:     'ok',
    hasChanges: hasChanges,
    data:       hasChanges ? data : null,
    serverTs:   serverTs,
    since:      since
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HANDLER: SYNC (POST — push perubahan dari client, pull balik)
// ═══════════════════════════════════════════════════════════════════════════

function handleSync(body) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(LOCK_TIMEOUT);
  } catch(e) {
    throw new Error('Server sedang sibuk, coba lagi sebentar');
  }

  try {
    const ss      = getSpreadsheet();
    const ops     = body.pendingOps || [];
    const device  = body.device     || 'Unknown';
    const since   = body.since      || 0;

    // Baca data server saat ini
    const serverData = readAllSheets(ss);

    // Apply operasi dari client
    if (ops.length > 0) {
      applyOps(ss, serverData, ops, device);
    }

    // Baca ulang data setelah apply (termasuk semua perubahan)
    const mergedData = readAllSheets(ss);
    const newServerTs = Date.now();
    setServerTs(ss, newServerTs);

    return {
      status:   'ok',
      merged:   mergedData,
      serverTs: newServerTs,
      opsApplied: ops.length,
      device:   device
    };
  } finally {
    lock.releaseLock();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HANDLER: FULL SYNC
// ═══════════════════════════════════════════════════════════════════════════

function handleFullSync() {
  const ss   = getSpreadsheet();
  const data = readAllSheets(ss);
  return {
    status:   'ok',
    data:     data,
    serverTs: getServerTs(ss)
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// OPS ENGINE: Apply pending operations ke spreadsheet
// ═══════════════════════════════════════════════════════════════════════════

function applyOps(ss, serverData, ops, device) {
  // Group ops per kategori
  const byKey = {};
  ops.forEach(op => {
    const k = op.cat + ':' + (op.data ? op.data.id : op.id);
    // Ambil op terbaru jika duplikat
    if (!byKey[k] || op.ts > byKey[k].ts) byKey[k] = op;
  });

  Object.values(byKey).forEach(op => {
    try {
      const cat = op.type === 'delete' ? op.cat : op.cat;
      if (!HEADERS[cat]) return;

      const sh = getOrCreateSheet(ss, cat);

      if (op.type === 'upsert' && op.data) {
        upsertRow(sh, op.data, HEADERS[cat], device);
      } else if (op.type === 'delete' && op.id) {
        softDeleteRow(sh, op.id, HEADERS[cat]);
      }
    } catch(e) {
      console.error('applyOp error:', e.message, op);
    }
  });

  // Trim log jika terlalu panjang
  trimLog(ss);
}

function upsertRow(sh, data, headers, device) {
  const id = String(data.id);
  const vals = sh.getDataRange().getValues();

  // Cari baris dengan ID ini
  let rowIdx = -1;
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === id) { rowIdx = i; break; }
  }

  // Bangun array nilai sesuai header
  const row = headers.map(h => {
    if (h === 'device') return device;
    const v = data[h];
    if (v === undefined || v === null) return '';
    return v;
  });

  if (rowIdx >= 0) {
    // Update: hanya update jika data lebih baru (conflict resolution)
    const existingUpdatedAt = vals[rowIdx][headers.indexOf('updatedAt')] || 0;
    const newUpdatedAt = data.updatedAt || 0;
    if (newUpdatedAt >= existingUpdatedAt) {
      sh.getRange(rowIdx + 1, 1, 1, headers.length).setValues([row]);
    }
  } else {
    // Insert baru
    sh.appendRow(row);
  }
}

function softDeleteRow(sh, id, headers) {
  const idStr = String(id);
  const vals  = sh.getDataRange().getValues();
  const delIdx = headers.indexOf('_deleted');
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === idStr) {
      if (delIdx >= 0) {
        sh.getRange(i + 1, delIdx + 1).setValue(1);
      }
      break;
    }
  }
}

function trimLog(ss) {
  const sh    = getOrCreateSheet(ss, SHEET_LOG);
  const rows  = sh.getLastRow() - 1; // -1 for header
  if (rows > MAX_LOG_ROWS) {
    const toDelete = rows - MAX_LOG_ROWS;
    sh.deleteRows(2, toDelete); // hapus dari baris paling lama
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// READ: Baca semua sheet → object data
// ═══════════════════════════════════════════════════════════════════════════

function readAllSheets(ss) {
  const result = { obat: [], apd: [], aset: [], log: [] };
  ['obat','apd','aset','log'].forEach(cat => {
    result[cat] = readSheet(ss, cat);
  });
  return result;
}

function readSheet(ss, cat) {
  const sh = getOrCreateSheet(ss, cat);
  const headers = HEADERS[cat];
  const vals = sh.getDataRange().getValues();
  if (vals.length <= 1) return [];

  const items = [];
  for (let i = 1; i < vals.length; i++) {
    const row  = vals[i];
    const obj  = {};
    headers.forEach((h, j) => {
      const v = row[j];
      // Konversi tipe data
      if (h === 'stok' || h === 'stokAwal' || h === 'masuk' || h === 'keluar' ||
          h === 'min' || h === 'harga' || h === 'qty' || h === 'ts' ||
          h === 'createdAt' || h === 'updatedAt' || h === 'recordedAt' || h === 'editedAt') {
        obj[h] = Number(v) || 0;
      } else if (h === '_deleted') {
        obj[h] = v ? 1 : 0;
      } else {
        obj[h] = v === null || v === undefined ? '' : String(v);
      }
    });
    // Jangan kirim yang sudah dihapus
    if (!obj._deleted) items.push(obj);
  }
  return items;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVER TIMESTAMP via _meta sheet
// ═══════════════════════════════════════════════════════════════════════════

function getServerTs(ss) {
  try {
    const sh = getOrCreateSheet(ss, SHEET_META);
    const v  = sh.getRange('B1').getValue();
    return Number(v) || Date.now();
  } catch { return Date.now(); }
}

function setServerTs(ss, ts) {
  try {
    const sh = getOrCreateSheet(ss, SHEET_META);
    sh.getRange('A1').setValue('serverTs');
    sh.getRange('B1').setValue(ts);
  } catch(e) { console.error('setServerTs:', e); }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS: Sheet management
// ═══════════════════════════════════════════════════════════════════════════

function getSpreadsheet() {
  if (!SHEET_ID || SHEET_ID === 'ISI_SHEET_ID_ANDA_DI_SINI') {
    throw new Error('SHEET_ID belum diisi di Code.gs! Isi SHEET_ID dengan ID Google Spreadsheet Anda.');
  }
  return SpreadsheetApp.openById(SHEET_ID);
}

function getOrCreateSheet(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    // Buat header
    const hdrs = HEADERS[name];
    if (hdrs) {
      sh.getRange(1, 1, 1, hdrs.length).setValues([hdrs]);
      sh.setFrozenRows(1);
      // Format header
      sh.getRange(1, 1, 1, hdrs.length)
        .setBackground('#1C1917')
        .setFontColor('#F7F4EF')
        .setFontWeight('bold');
    }
  }
  return sh;
}

function jsonOk(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonErr(msg) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'error', error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════════════════════════
// INIT: Buat semua sheet — jalankan SEKALI setelah paste kode ini
// ═══════════════════════════════════════════════════════════════════════════

function initSheets() {
  const ss = getSpreadsheet();
  ['obat','apd','aset','log',SHEET_META].forEach(name => {
    getOrCreateSheet(ss, name);
  });
  // Set timestamp awal
  setServerTs(ss, Date.now());

  Logger.log('✅ VinStock sheets berhasil dibuat!');
  Logger.log('Sheet ID: ' + SHEET_ID);
  Logger.log('Sheets: ' + ss.getSheets().map(s => s.getName()).join(', '));
  Logger.log('Sekarang deploy sebagai Web App.');
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY: Reset semua data (HATI-HATI — hanya untuk development!)
// ═══════════════════════════════════════════════════════════════════════════

function _DANGER_resetAllData() {
  const confirm = Browser.msgBox(
    'PERINGATAN',
    'Ini akan menghapus SEMUA data di spreadsheet!\nKetik "HAPUS" untuk konfirmasi.',
    Browser.Buttons.OK_CANCEL
  );
  if (confirm !== 'ok') return;

  const ss = getSpreadsheet();
  ['obat','apd','aset','log'].forEach(name => {
    const sh = ss.getSheetByName(name);
    if (sh && sh.getLastRow() > 1) {
      sh.deleteRows(2, sh.getLastRow() - 1);
    }
  });
  setServerTs(ss, Date.now());
  Logger.log('Data di-reset.');
}
