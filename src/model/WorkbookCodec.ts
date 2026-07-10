import type { Rect } from "./cellRef";
import type { CellWrite } from "./SheetHistory";
import type { SheetBounds } from "./SheetClipboard";
import type { SheetModel } from "./SheetModel";
import { Workbook, type WorkbookSnapshot } from "./Workbook";

/** Serialize only the documented, versioned document representation. */
export function toWorkbookJson(workbook: Workbook): string {
  return JSON.stringify(workbook.toSnapshot());
}

/** Reject malformed documents through Workbook's versioned snapshot contract. */
export function parseWorkbookJson(source: string): Workbook {
  return Workbook.fromSnapshot(JSON.parse(source) as WorkbookSnapshot);
}

/** Export editable raw cell content so formulas survive a CSV round-trip. */
export function toCsv(model: SheetModel, range: Rect): string {
  const rows: string[] = [];
  for (let row = range.r1; row <= range.r2; row++) {
    const fields: string[] = [];
    for (let col = range.c1; col <= range.c2; col++)
      fields.push(escapeCsv(model.getRaw(row, col)));
    rows.push(fields.join(","));
  }
  return rows.join("\r\n");
}

/** Parse RFC 4180-style quoted fields into bounded raw document writes. */
export function fromCsv(
  source: string,
  origin: { row: number; col: number },
  bounds: SheetBounds,
): CellWrite[] {
  const rows = parseCsv(source);
  const writes: CellWrite[] = [];
  for (const [rowOffset, fields] of rows.entries()) {
    const row = origin.row + rowOffset;
    if (row >= bounds.rows) break;
    for (const [colOffset, raw] of fields.entries()) {
      const col = origin.col + colOffset;
      if (col >= bounds.cols) break;
      writes.push({ row, col, raw });
    }
  }
  return writes;
}

function escapeCsv(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function parseCsv(source: string): string[][] {
  const rows: string[][] = [[]];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"' && field === "") {
      quoted = true;
    } else if (char === ",") {
      rows.at(-1)?.push(field);
      field = "";
    } else if (char === "\n") {
      rows.at(-1)?.push(field);
      rows.push([]);
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (quoted) throw new RangeError("Unterminated CSV quoted field");
  rows.at(-1)?.push(field);
  return rows;
}
