import type { Rect } from "./cellRef";
import type { CellStateWrite } from "./SheetHistory";
import type { SheetModel } from "./SheetModel";
import { captureRange } from "./SheetRangeTransfer";
import { translateFormulaReferences } from "./SheetStructure";
import { isErr, type Value } from "./formula/evaluator";

export type SortDirection = "ascending" | "descending";

interface SortRow {
  rowOffset: number;
  value: Value;
}

/**
 * Return sparse exact-state writes that reorder complete rows inside a range.
 * Formula references move by the source-to-destination delta; blank keys remain
 * last in either direction, matching familiar personal spreadsheet behavior.
 */
export function sortRange(
  model: SheetModel,
  range: Rect,
  keyColumn: number,
  direction: SortDirection,
): CellStateWrite[] {
  const payload = captureRange(model, range);
  if (
    !Number.isInteger(keyColumn) ||
    keyColumn < range.c1 ||
    keyColumn > range.c2
  )
    throw new RangeError("Sort key column is outside the sorted range");
  if (direction !== "ascending" && direction !== "descending")
    throw new RangeError("Sort direction is invalid");

  const rows: SortRow[] = Array.from(
    { length: payload.rows },
    (_, rowOffset) => ({
      rowOffset,
      value: model.getValue(range.r1 + rowOffset, keyColumn),
    }),
  );
  rows.sort((left, right) => {
    const compared = compareValues(left.value, right.value, direction);
    return compared || left.rowOffset - right.rowOffset;
  });

  const cellsByRow = new Map<number, typeof payload.cells>();
  for (const cell of payload.cells) {
    const row = cellsByRow.get(cell.rowOffset) ?? [];
    row.push(cell);
    cellsByRow.set(cell.rowOffset, row);
  }

  const writes = new Map<string, CellStateWrite>();
  // Existing destination records must be cleared when their incoming row has
  // no matching sparse record at that column.
  for (const cell of payload.cells) {
    const row = range.r1 + cell.rowOffset;
    const col = range.c1 + cell.colOffset;
    writes.set(`${row}:${col}`, { row, col, raw: "", format: undefined });
  }
  rows.forEach((source, destinationOffset) => {
    const destinationRow = range.r1 + destinationOffset;
    const sourceRow = range.r1 + source.rowOffset;
    for (const cell of cellsByRow.get(source.rowOffset) ?? []) {
      const col = range.c1 + cell.colOffset;
      writes.set(`${destinationRow}:${col}`, {
        row: destinationRow,
        col,
        raw: translateFormulaReferences(
          cell.raw,
          destinationRow - sourceRow,
          0,
          model,
        ),
        format: cell.format ? { ...cell.format } : undefined,
      });
    }
  });
  return [...writes.values()].sort((a, b) => a.row - b.row || a.col - b.col);
}

function compareValues(
  left: Value,
  right: Value,
  direction: SortDirection,
): number {
  if (left === null || right === null) {
    if (left === right) return 0;
    return left === null ? 1 : -1;
  }
  const compared = compareNonBlank(left, right);
  return direction === "ascending" ? compared : -compared;
}

function compareNonBlank(
  left: Exclude<Value, null>,
  right: Exclude<Value, null>,
) {
  const leftRank = valueRank(left);
  const rightRank = valueRank(right);
  if (leftRank !== rightRank) return leftRank - rightRank;
  if (typeof left === "number" && typeof right === "number")
    return left - right;
  if (typeof left === "boolean" && typeof right === "boolean")
    return Number(left) - Number(right);
  const leftText = isErr(left) ? left.error : String(left);
  const rightText = isErr(right) ? right.error : String(right);
  const foldedLeft = leftText.toLocaleLowerCase("en-US");
  const foldedRight = rightText.toLocaleLowerCase("en-US");
  if (foldedLeft < foldedRight) return -1;
  if (foldedLeft > foldedRight) return 1;
  return 0;
}

function valueRank(value: Exclude<Value, null>): number {
  if (typeof value === "number") return 0;
  if (typeof value === "string") return 1;
  if (typeof value === "boolean") return 2;
  return 3;
}
