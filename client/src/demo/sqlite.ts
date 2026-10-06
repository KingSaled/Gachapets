/**
 * A tiny better-sqlite3–compatible facade over sql.js (pure asm.js SQLite,
 * no WebAssembly), so the real server services run unchanged in the browser.
 */
import type { Database as SqlJsDatabase, SqlValue, Statement } from 'sql.js';

type Params = SqlValue[];

export class BrowserStatement {
  constructor(private owner: BrowserDb, private sql: string) {}

  private stmt(params: unknown[]): Statement {
    const s = this.owner.cached(this.sql);
    s.bind(params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p)) as Params);
    return s;
  }

  get(...params: unknown[]): any {
    const s = this.stmt(params);
    try {
      return s.step() ? s.getAsObject() : undefined;
    } finally {
      s.reset();
    }
  }

  all(...params: unknown[]): any[] {
    const s = this.stmt(params);
    const rows: unknown[] = [];
    try {
      while (s.step()) rows.push(s.getAsObject());
    } finally {
      s.reset();
    }
    return rows;
  }

  run(...params: unknown[]) {
    const s = this.stmt(params);
    try {
      while (s.step()) {
        /* drain (RETURNING rows are ignored by run, like better-sqlite3) */
      }
    } finally {
      s.reset();
    }
    const changes = this.owner.raw.getRowsModified();
    const id = this.owner.raw.exec('SELECT last_insert_rowid()')[0]?.values[0][0] ?? 0;
    return { changes, lastInsertRowid: Number(id) };
  }
}

export class BrowserDb {
  private cache = new Map<string, Statement>();
  private depth = 0;
  dirty = false;

  constructor(public raw: SqlJsDatabase) {}

  cached(sql: string): Statement {
    let s = this.cache.get(sql);
    if (!s) {
      s = this.raw.prepare(sql);
      this.cache.set(sql, s);
    }
    return s;
  }

  prepare(sql: string) {
    if (!/^\s*select/i.test(sql)) this.dirty = true;
    return new BrowserStatement(this, sql);
  }

  exec(sql: string) {
    this.dirty = true;
    this.raw.exec(sql);
  }

  pragma(sql: string) {
    this.raw.exec(`PRAGMA ${sql}`);
  }

  transaction<T extends (...args: any[]) => any>(fn: T) {
    return (...args: Parameters<T>): ReturnType<T> => {
      const sp = `sp${this.depth}`;
      this.raw.exec(this.depth === 0 ? 'BEGIN' : `SAVEPOINT ${sp}`);
      this.depth++;
      try {
        const result = fn(...args);
        this.depth--;
        this.raw.exec(this.depth === 0 ? 'COMMIT' : `RELEASE ${sp}`);
        return result;
      } catch (err) {
        this.depth--;
        this.raw.exec(this.depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
        throw err;
      }
    };
  }

  /** Serialize the whole database (frees cached statements, as sql.js requires). */
  export(): Uint8Array {
    for (const s of this.cache.values()) s.free();
    this.cache.clear();
    this.dirty = false;
    return this.raw.export();
  }

  close() {
    this.raw.close();
  }
}
