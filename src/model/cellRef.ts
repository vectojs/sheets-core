/** A1-notation helpers. Rows/cols are 0-based internally; A1 is 1-based. */

export interface CellPos {
  row: number;
  col: number;
}

export interface Rect {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

/** 0 → "A", 25 → "Z", 26 → "AA", 99 → "CV". */
export function colName(col: number): string {
  let name = "";
  let n = col;
  for (;;) {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
    if (n < 0) return name;
  }
}

/** "A" → 0, "CV" → 99. Returns -1 for invalid input. */
export function colIndex(name: string): number {
  let n = 0;
  for (const ch of name) {
    const d = ch.charCodeAt(0) - 64;
    if (d < 1 || d > 26) return -1;
    n = n * 26 + d;
  }
  return n - 1;
}

const A1_RE = /^\$?([A-Z]{1,3})\$?(\d+)$/;

/** "B3" (or "$B$3") → {row: 2, col: 1}; null when not a cell ref. */
export function parseA1(text: string): CellPos | null {
  const m = A1_RE.exec(text);
  if (!m) return null;
  const col = colIndex(m[1]);
  const row = Number(m[2]) - 1;
  if (col < 0 || row < 0) return null;
  return { row, col };
}

/** {row:2, col:1} → "B3". */
export function toA1(pos: CellPos): string {
  return `${colName(pos.col)}${pos.row + 1}`;
}

/** "A1:B5" → normalized Rect (corners sorted); null when not a range. */
export function parseRange(text: string): Rect | null {
  const parts = text.split(":");
  if (parts.length !== 2) return null;
  const a = parseA1(parts[0]);
  const b = parseA1(parts[1]);
  if (!a || !b) return null;
  return normalizeRect(a, b);
}

export function normalizeRect(a: CellPos, b: CellPos): Rect {
  return {
    r1: Math.min(a.row, b.row),
    c1: Math.min(a.col, b.col),
    r2: Math.max(a.row, b.row),
    c2: Math.max(a.col, b.col),
  };
}

export function rectContains(rect: Rect, row: number, col: number): boolean {
  return row >= rect.r1 && row <= rect.r2 && col >= rect.c1 && col <= rect.c2;
}

export function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

export function parseKey(key: string): CellPos {
  const i = key.indexOf(":");
  return { row: Number(key.slice(0, i)), col: Number(key.slice(i + 1)) };
}
