'use strict';
const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'kredyt.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS overpayments (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    date   TEXT    NOT NULL,
    amount REAL    NOT NULL,
    note   TEXT    NOT NULL DEFAULT ''
  );
`);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// GET /api/state — ładuje wszystko naraz przy starcie strony
app.get('/api/state', (req, res) => {
  const settings = Object.fromEntries(
    db.prepare('SELECT key, value FROM settings').all().map(r => [r.key, r.value])
  );
  const overpayments = db
    .prepare('SELECT id, date, amount, note FROM overpayments ORDER BY date, id')
    .all();
  res.json({ settings, overpayments });
});

// POST /api/settings — zapisuje ustawienia (monthlyExtra, fixedTotal, payoffThreshold, rate)
app.post('/api/settings', (req, res) => {
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  db.transaction(obj => {
    for (const [k, v] of Object.entries(obj)) upsert.run(k, String(v));
  })(req.body);
  res.json({ ok: true });
});

// POST /api/overpayments — dodaje nadpłatę, zwraca rekord z id
app.post('/api/overpayments', (req, res) => {
  const { date, amount, note = '' } = req.body;
  if (!date || !amount || Number(amount) <= 0) {
    return res.status(400).json({ error: 'Nieprawidłowe dane' });
  }
  const { lastInsertRowid } = db
    .prepare('INSERT INTO overpayments (date, amount, note) VALUES (?, ?, ?)')
    .run(date, Number(amount), String(note));
  res.json({ id: lastInsertRowid, date, amount: Number(amount), note: String(note) });
});

// DELETE /api/overpayments/:id — usuwa nadpłatę
app.delete('/api/overpayments/:id', (req, res) => {
  db.prepare('DELETE FROM overpayments WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Kredyt app: http://localhost:${PORT}  (DB: ${DB_PATH})`);
});
