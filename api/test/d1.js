/* Minimal D1 shim over node:sqlite so the real Worker code can be exercised
   locally. Mirrors prepare/bind/run/first/all and meta.changes. */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

export function makeDB(schemaPath, seedPath) {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(schemaPath, 'utf8'));
  if (seedPath) db.exec(fs.readFileSync(seedPath, 'utf8'));

  const wrap = sql => {
    let binds = [];
    const api = {
      bind(...a) { binds = a.map(v => v === undefined ? null : (typeof v === 'boolean' ? (v ? 1 : 0) : v)); return api; },
      run() {
        const st = db.prepare(sql);
        const r = st.run(...binds);
        return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
      },
      first() { const r = db.prepare(sql).all(...binds); return r[0] ?? null; },
      all() { return { results: db.prepare(sql).all(...binds) }; }
    };
    return api;
  };
  return { prepare: wrap, _raw: db };
}
