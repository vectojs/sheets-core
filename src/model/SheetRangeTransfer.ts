import type { CellFormat } from "./CellFormat";
import type { CellPos, Rect } from "./cellRef";
import type { CellStateWrite } from "./SheetHistory";
import type { SheetBounds } from "./SheetClipboard";
import type { SheetModel } from "./SheetModel";
import { translateFormulaReferences } from "./SheetStructure";

export interface RangeCellSnapshot {
  rowOffset: number;
  colOffset: number;
  raw: string;
  format?: CellFormat;
}

export interface SheetRangePayload {
  origin: CellPos;
  rows: number;
  cols: number;
  cells: RangeCellSnapshot[];
}

/** Capture sparse records plus dimensions; missing records are logical empty cells. */
export function captureRange(
  model: SheetModel,
  range: Rect,
): SheetRangePayload {
  validateRange(range, model);
  const cells = model.getCellsInRange(range).map((cell) => ({
    rowOffset: cell.row - range.r1,
    colOffset: cell.col - range.c1,
    raw: cell.raw,
    format: cell.format ? { ...cell.format } : undefined,
  }));
  return {
    origin: { row: range.r1, col: range.c1 },
    rows: range.r2 - range.r1 + 1,
    cols: range.c2 - range.c1 + 1,
    cells,
  };
}

/** Tile a captured range into a target and translate formulas per destination. */
export function transferRange(
  payload: SheetRangePayload,
  target: Rect,
  bounds: SheetBounds,
  alignmentOrigin: CellPos = payload.origin,
): CellStateWrite[] {
  validatePayload(payload);
  validateRange(target, bounds);
  const cellsByOffset = new Map(
    payload.cells.map((cell) => [`${cell.rowOffset}:${cell.colOffset}`, cell]),
  );
  const writes: CellStateWrite[] = [];
  for (let row = target.r1; row <= target.r2; row++) {
    for (let col = target.c1; col <= target.c2; col++) {
      const rowOffset = modulo(row - alignmentOrigin.row, payload.rows);
      const colOffset = modulo(col - alignmentOrigin.col, payload.cols);
      const source = cellsByOffset.get(`${rowOffset}:${colOffset}`);
      const sourceRow = payload.origin.row + rowOffset;
      const sourceCol = payload.origin.col + colOffset;
      writes.push({
        row,
        col,
        raw: translateFormulaReferences(
          source?.raw ?? "",
          row - sourceRow,
          col - sourceCol,
          bounds,
        ),
        format: source?.format ? { ...source.format } : undefined,
      });
    }
  }
  return writes;
}

function validatePayload(payload: SheetRangePayload): void {
  if (
    !Number.isInteger(payload.origin.row) ||
    !Number.isInteger(payload.origin.col) ||
    payload.origin.row < 0 ||
    payload.origin.col < 0 ||
    !Number.isInteger(payload.rows) ||
    !Number.isInteger(payload.cols) ||
    payload.rows < 1 ||
    payload.cols < 1
  ) {
    throw new RangeError("Range transfer payload has invalid dimensions");
  }
  const offsets = new Set<string>();
  for (const cell of payload.cells) {
    if (
      !Number.isInteger(cell.rowOffset) ||
      !Number.isInteger(cell.colOffset) ||
      cell.rowOffset < 0 ||
      cell.colOffset < 0 ||
      cell.rowOffset >= payload.rows ||
      cell.colOffset >= payload.cols ||
      typeof cell.raw !== "string"
    ) {
      throw new RangeError("Range transfer payload has an invalid cell");
    }
    const key = `${cell.rowOffset}:${cell.colOffset}`;
    if (offsets.has(key))
      throw new RangeError("Range transfer payload has duplicate cells");
    offsets.add(key);
  }
}

function validateRange(range: Rect, bounds: SheetBounds): void {
  if (
    !Number.isInteger(range.r1) ||
    !Number.isInteger(range.c1) ||
    !Number.isInteger(range.r2) ||
    !Number.isInteger(range.c2) ||
    range.r1 < 0 ||
    range.c1 < 0 ||
    range.r2 < range.r1 ||
    range.c2 < range.c1 ||
    range.r2 >= bounds.rows ||
    range.c2 >= bounds.cols
  ) {
    throw new RangeError("Range transfer is outside sheet bounds");
  }
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
