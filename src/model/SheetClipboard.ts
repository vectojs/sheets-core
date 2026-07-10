import type { Rect } from "./cellRef";
import type { CellWrite } from "./SheetHistory";
import type { SheetModel } from "./SheetModel";

export interface SheetBounds {
  rows: number;
  cols: number;
}

/** Serializes editable raw cell content into the browser spreadsheet TSV shape. */
export function copyRange(model: SheetModel, range: Rect): string {
  const rows: string[] = [];
  for (let row = range.r1; row <= range.r2; row++) {
    const cells: string[] = [];
    for (let col = range.c1; col <= range.c2; col++)
      cells.push(model.getRaw(row, col));
    rows.push(cells.join("\t"));
  }
  return rows.join("\n");
}

/** Converts a tabular clipboard payload into in-bounds document writes. */
export function pasteText(
  text: string,
  origin: { row: number; col: number },
  bounds: SheetBounds,
): CellWrite[] {
  const writes: CellWrite[] = [];
  for (const [rowOffset, line] of text
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split("\n")
    .entries()) {
    const row = origin.row + rowOffset;
    if (row >= bounds.rows) break;
    for (const [colOffset, raw] of line.split("\t").entries()) {
      const col = origin.col + colOffset;
      if (col >= bounds.cols) break;
      writes.push({ row, col, raw });
    }
  }
  return writes;
}
