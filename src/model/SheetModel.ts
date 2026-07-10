import { cellKey, parseKey, rectContains, type Rect } from "./cellRef";
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
  value: Value;
  ast: Node | null;
  /** Cells and ranges this formula reads (forward deps). */
  reads: { scalars: Set<string>; ranges: Rect[] } | null;
}

/**
 * Sparse spreadsheet model: a Map of only the non-empty cells, a reverse
 * dependency index for scalar refs, and a rect list for range refs (a range
 * like A1:A10000 is stored as ONE rect with containment checks — never
 * expanded into 10k edges). Pure TS; no canvas imports; bun-test friendly.
 */
export class SheetModel {
  readonly rows: number;
  readonly cols: number;

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
      // Trim float noise without switching to exponential for common cases.
      return Number.isInteger(v)
        ? String(v)
        : String(Math.round(v * 1e10) / 1e10);
    }
    return v;
  }

  /** Number of non-empty cells (for HUD/debug). */
  get cellCount(): number {
    return this.cells.size;
  }

  setCell(row: number, col: number, raw: string): void {
    const key = cellKey(row, col);
    const trimmed = raw.trim();

    // Collect everything that must re-evaluate BEFORE rewiring, so cells that
    // depended on the old formula still get refreshed.
    const dirty = this.collectDependents(key);

    this.unwireReads(key);

    if (trimmed === "") {
      this.cells.delete(key);
    } else if (trimmed.startsWith("=")) {
      let ast: Node | null = null;
      let parseFailed = false;
      try {
        ast = parse(trimmed.slice(1));
      } catch (e) {
        if (!(e instanceof ParseError)) throw e;
        parseFailed = true;
      }
      const cell: Cell = { raw: trimmed, value: null, ast, reads: null };
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
      this.cells.set(key, { raw, value, ast: null, reads: null });
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
