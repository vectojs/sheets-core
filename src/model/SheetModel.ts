import { cellKey, parseKey, rectContains, type Rect } from "./cellRef";
import { mergeFormat, type CellFormat } from "./CellFormat";
import {
  transformCellPosition,
  transformFormulaReferences,
  type SheetStructureOperation,
} from "./SheetStructure";
import { parse, ParseError, type Node } from "./formula/parser";
import {
  evaluate,
  collectRefs,
  isErr,
  err,
  CycleError,
  type Value,
  type EvalContext,
} from "./formula/evaluator";

interface Cell {
  raw: string;
  format?: CellFormat;
  value: Value;
  ast: Node | null;
  /** Cells and ranges this formula reads (forward deps). */
  reads: { scalars: Set<string>; ranges: Rect[] } | null;
}

/** Serializable view of a populated sparse document cell. */
export interface PopulatedCell {
  row: number;
  col: number;
  raw: string;
  format?: CellFormat;
}

/** Serializable, sparse document state used by structure history and codecs. */
export interface SheetSnapshot {
  rows: number;
  cols: number;
  cells: PopulatedCell[];
}

/**
 * Sparse spreadsheet model: a Map of only the non-empty cells, a reverse
 * dependency index for scalar refs, and a rect list for range refs (a range
 * like A1:A10000 is stored as ONE rect with containment checks — never
 * expanded into 10k edges). Pure TS; no canvas imports; bun-test friendly.
 */
export class SheetModel {
  rows: number;
  cols: number;

  private cells = new Map<string, Cell>();
  /** key → formula-cell keys that read it via a scalar ref. */
  private scalarDependents = new Map<string, Set<string>>();
  /** Range reads: checked by containment when a cell changes. */
  private rangeDependents: Array<{ rect: Rect; dependent: string }> = [];
  private listeners = new Set<() => void>();

  constructor(rows = 10_000, cols = 100) {
    this.rows = rows;
    this.cols = cols;
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  /** Raw editable text of a cell ("" when empty). */
  getRaw(row: number, col: number): string {
    return this.cells.get(cellKey(row, col))?.raw ?? "";
  }

  /** Resolved value (null when empty). */
  getValue(row: number, col: number): Value {
    return this.cells.get(cellKey(row, col))?.value ?? null;
  }

  /** Display string for the grid. */
  getDisplay(row: number, col: number): string {
    const v = this.getValue(row, col);
    if (v === null) return "";
    if (isErr(v)) return v.error;
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    if (typeof v === "number") {
      const numberFormat = this.getFormat(row, col).numberFormat;
      if (numberFormat === "percent") return `${Math.round(v * 10000) / 100}%`;
      if (numberFormat === "currency") return `$${Math.round(v * 100) / 100}`;
      // Trim float noise without switching to exponential for common cases.
      return Number.isInteger(v)
        ? String(v)
        : String(Math.round(v * 1e10) / 1e10);
    }
    return v;
  }

  getFormat(row: number, col: number): Readonly<CellFormat> {
    return this.cells.get(cellKey(row, col))?.format ?? {};
  }

  hasFormat(row: number, col: number): boolean {
    return this.cells.get(cellKey(row, col))?.format !== undefined;
  }

  setFormat(row: number, col: number, patch: CellFormat): void {
    const key = cellKey(row, col);
    const cell = this.cells.get(key);
    if (!cell) {
      this.cells.set(key, {
        raw: "",
        value: null,
        ast: null,
        reads: null,
        format: mergeFormat({}, patch),
      });
    } else {
      cell.format = mergeFormat(cell.format ?? {}, patch);
    }
    this.emit();
  }

  /** Replace the complete stored format; used by transactional undo/redo. */
  replaceFormat(
    row: number,
    col: number,
    format: CellFormat | undefined,
  ): void {
    const key = cellKey(row, col);
    const cell = this.cells.get(key);
    if (!cell && !format) return;
    if (!cell) {
      this.cells.set(key, {
        raw: "",
        value: null,
        ast: null,
        reads: null,
        format: { ...format },
      });
    } else if (!format && cell.raw === "") {
      this.cells.delete(key);
    } else {
      cell.format = format ? { ...format } : undefined;
    }
    this.emit();
  }

  /** Number of non-empty cells (for HUD/debug). */
  get cellCount(): number {
    return this.cells.size;
  }

  /**
   * Smallest normalized rectangle containing every populated cell, or null for
   * an empty document. This is a document query, not a viewport concern.
   */
  getUsedRange(): Rect | null {
    if (this.cells.size === 0) return null;
    let r1 = this.rows - 1;
    let c1 = this.cols - 1;
    let r2 = 0;
    let c2 = 0;
    for (const key of this.cells.keys()) {
      const { row, col } = parseKey(key);
      r1 = Math.min(r1, row);
      c1 = Math.min(c1, col);
      r2 = Math.max(r2, row);
      c2 = Math.max(c2, col);
    }
    return { r1, c1, r2, c2 };
  }

  /**
   * Enumerate only existing cells in a normalized document rectangle. This is
   * the safe primitive for clear/cut: selecting the complete 10,000 × 100
   * sheet must not create one million empty writes.
   */
  getCellsInRange(range: Rect): PopulatedCell[] {
    const records: PopulatedCell[] = [];
    for (const [key, cell] of this.cells) {
      const { row, col } = parseKey(key);
      if (rectContains(range, row, col))
        records.push({
          row,
          col,
          raw: cell.raw,
          format: cell.format ? { ...cell.format } : undefined,
        });
    }
    return records.sort((a, b) => a.row - b.row || a.col - b.col);
  }

  /** Capture only sparse records, never the full logical rectangle. */
  toSnapshot(): SheetSnapshot {
    return {
      rows: this.rows,
      cols: this.cols,
      cells: this.getCellsInRange({
        r1: 0,
        c1: 0,
        r2: this.rows - 1,
        c2: this.cols - 1,
      }),
    };
  }

  /** Replace document state atomically after a validated history operation. */
  restoreSnapshot(snapshot: SheetSnapshot): void {
    validateSnapshot(snapshot);
    const rebuilt = new SheetModel(snapshot.rows, snapshot.cols);
    for (const cell of snapshot.cells) {
      rebuilt.setCell(cell.row, cell.col, cell.raw);
      if (cell.format) rebuilt.setFormat(cell.row, cell.col, cell.format);
    }
    this.rows = snapshot.rows;
    this.cols = snapshot.cols;
    this.cells = rebuilt.cells;
    this.scalarDependents = rebuilt.scalarDependents;
    this.rangeDependents = rebuilt.rangeDependents;
    this.emit();
  }

  /**
   * Move sparse records and rewrite formula source for a row/column operation.
   * The transformed state is rebuilt through normal parsing so dependency indexes
   * and calculated values cannot retain coordinates from the previous shape.
   */
  applyStructure(operation: SheetStructureOperation): void {
    validateStructure(operation, this.rows, this.cols);
    const before = this.toSnapshot();
    const nextRows =
      operation.axis === "row"
        ? before.rows +
          (operation.kind === "insert" ? operation.count : -operation.count)
        : before.rows;
    const nextCols =
      operation.axis === "column"
        ? before.cols +
          (operation.kind === "insert" ? operation.count : -operation.count)
        : before.cols;
    const cells: PopulatedCell[] = [];
    for (const cell of before.cells) {
      const position = transformCellPosition(cell, operation);
      if (!position) continue;
      cells.push({
        row: position.row,
        col: position.col,
        raw: cell.raw.startsWith("=")
          ? transformFormulaReferences(cell.raw, operation)
          : cell.raw,
        format: cell.format ? { ...cell.format } : undefined,
      });
    }
    this.restoreSnapshot({ rows: nextRows, cols: nextCols, cells });
  }

  setCell(row: number, col: number, raw: string): void {
    const key = cellKey(row, col);
    const trimmed = raw.trim();

    // Collect everything that must re-evaluate BEFORE rewiring, so cells that
    // depended on the old formula still get refreshed.
    const dirty = this.collectDependents(key);

    this.unwireReads(key);

    if (trimmed === "") {
      if (this.cells.get(key)?.format) {
        this.cells.set(key, {
          raw: "",
          value: null,
          ast: null,
          reads: null,
          format: this.cells.get(key)?.format,
        });
      } else this.cells.delete(key);
    } else if (trimmed.startsWith("=")) {
      let ast: Node | null = null;
      let parseFailed = false;
      try {
        ast = parse(trimmed.slice(1));
      } catch (e) {
        if (!(e instanceof ParseError)) throw e;
        parseFailed = true;
      }
      const cell: Cell = {
        raw: trimmed,
        value: null,
        ast,
        reads: null,
        format: this.cells.get(key)?.format,
      };
      if (parseFailed) {
        cell.value = err("#ERROR!");
      } else if (ast) {
        const scalars = new Set<string>();
        const ranges: Rect[] = [];
        collectRefs(ast, scalars, ranges);
        cell.reads = { scalars, ranges };
        for (const s of scalars) {
          let set = this.scalarDependents.get(s);
          if (!set) this.scalarDependents.set(s, (set = new Set()));
          set.add(key);
        }
        for (const rect of ranges)
          this.rangeDependents.push({ rect, dependent: key });
      }
      this.cells.set(key, cell);
    } else {
      const n = Number(trimmed);
      const value: Value = trimmed !== "" && !Number.isNaN(n) ? n : raw;
      this.cells.set(key, {
        raw,
        value,
        ast: null,
        reads: null,
        format: this.cells.get(key)?.format,
      });
    }

    dirty.add(key);
    this.recalculate(dirty);
    this.emit();
  }

  /** Remove key's outgoing read edges (called before rewriting the cell). */
  private unwireReads(key: string): void {
    const cell = this.cells.get(key);
    if (!cell?.reads) return;
    for (const s of cell.reads.scalars) {
      this.scalarDependents.get(s)?.delete(key);
    }
    if (cell.reads.ranges.length > 0) {
      this.rangeDependents = this.rangeDependents.filter(
        (rd) => rd.dependent !== key,
      );
    }
  }

  /** Transitive closure of formula cells that (directly or not) read `key`. */
  private collectDependents(key: string): Set<string> {
    const out = new Set<string>();
    const queue = [key];
    while (queue.length > 0) {
      const k = queue.pop()!;
      const direct = new Set<string>(this.scalarDependents.get(k) ?? []);
      const { row, col } = parseKey(k);
      for (const rd of this.rangeDependents) {
        if (rectContains(rd.rect, row, col)) direct.add(rd.dependent);
      }
      for (const d of direct) {
        if (!out.has(d)) {
          out.add(d);
          queue.push(d);
        }
      }
    }
    return out;
  }

  /**
   * Re-evaluate the dirty set in dependency order via DFS with a visiting
   * state: hitting a cell that is currently being evaluated means a reference
   * cycle — every participant gets #CYCLE!.
   */
  private recalculate(dirty: Set<string>): void {
    const state = new Map<string, "visiting" | "done">();

    const evalCell = (key: string): Value => {
      const cell = this.cells.get(key);
      if (!cell) return null;
      if (!cell.ast) return cell.value; // literal, or formula that failed to parse
      const s = state.get(key);
      if (s === "done" || (!dirty.has(key) && s === undefined))
        return cell.value;
      if (s === "visiting") throw new CycleError(key);
      state.set(key, "visiting");
      const ctx: EvalContext = {
        getCell: (r, c) => {
          if (r < 0 || c < 0 || r >= this.rows || c >= this.cols)
            return err("#REF!");
          return evalCell(cellKey(r, c));
        },
      };
      try {
        cell.value = evaluate(cell.ast, ctx);
      } catch (e) {
        if (!(e instanceof CycleError)) throw e;
        cell.value = err("#CYCLE!");
        state.set(key, "done");
        throw e; // let every cell on the cycle path mark itself too
      }
      state.set(key, "done");
      return cell.value;
    };

    for (const key of dirty) {
      try {
        evalCell(key);
      } catch (e) {
        if (!(e instanceof CycleError)) throw e;
        // Cycle already marked along the path; move on.
        const cell = this.cells.get(key);
        if (cell?.ast) cell.value = err("#CYCLE!");
        state.set(key, "done");
      }
    }
  }
}

function validateSnapshot(snapshot: SheetSnapshot): void {
  if (!Number.isInteger(snapshot.rows) || snapshot.rows < 1)
    throw new RangeError("Sheet snapshot must retain at least one row");
  if (!Number.isInteger(snapshot.cols) || snapshot.cols < 1)
    throw new RangeError("Sheet snapshot must retain at least one column");
  for (const cell of snapshot.cells) {
    if (
      !Number.isInteger(cell.row) ||
      !Number.isInteger(cell.col) ||
      cell.row < 0 ||
      cell.col < 0 ||
      cell.row >= snapshot.rows ||
      cell.col >= snapshot.cols
    )
      throw new RangeError("Snapshot cell is outside sheet bounds");
  }
}

function validateStructure(
  operation: SheetStructureOperation,
  rows: number,
  cols: number,
): void {
  const size = operation.axis === "row" ? rows : cols;
  if (
    !Number.isInteger(operation.index) ||
    !Number.isInteger(operation.count) ||
    operation.count < 1
  )
    throw new RangeError(
      "Structural index and count must be positive integers",
    );
  if (operation.kind === "insert") {
    if (operation.index < 0 || operation.index > size)
      throw new RangeError("Structural insert index is outside sheet bounds");
    return;
  }
  if (operation.index < 0 || operation.index + operation.count > size)
    throw new RangeError("Structural delete range is outside sheet bounds");
  if (operation.count >= size)
    throw new RangeError(
      `A sheet must retain its last ${operation.axis === "row" ? "row" : "column"}`,
    );
}
