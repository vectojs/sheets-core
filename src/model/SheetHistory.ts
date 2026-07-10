import { SheetModel, type SheetSnapshot } from "./SheetModel";
import { mergeFormat, type CellFormat } from "./CellFormat";
import type { SheetAxis } from "./SheetAxisMetrics";
import type { SheetStructureOperation } from "./SheetStructure";

export interface CellWrite {
  row: number;
  col: number;
  raw: string;
}

interface CellChange extends CellWrite {
  before: string;
}

export interface CellFormatWrite {
  row: number;
  col: number;
  format: CellFormat;
}

export interface AxisSizeWrite {
  axis: SheetAxis;
  index: number;
  size: number;
}

interface AxisSizeChange extends AxisSizeWrite {
  before: number;
}

interface FormatChange extends CellFormatWrite {
  before: CellFormat | undefined;
  after: CellFormat;
}

type HistoryEntry =
  | { kind: "cells"; changes: CellChange[] }
  | { kind: "formats"; changes: FormatChange[] }
  | { kind: "axis-sizes"; changes: AxisSizeChange[] }
  | { kind: "structure"; before: SheetSnapshot; after: SheetSnapshot };

/**
 * Transactional undo/redo for document operations. The UI, clipboard and a
 * future MCP surface all submit the same `CellWrite[]` shape, never Canvas
 * state, so history remains deterministic and independently testable.
 */
export class SheetHistory {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];

  constructor(private readonly model: SheetModel) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  apply(writes: CellWrite[]): void {
    const changes = writes
      .map((write) => ({
        ...write,
        before: this.model.getRaw(write.row, write.col),
      }))
      .filter((change) => change.before !== change.raw);
    if (changes.length === 0) return;
    for (const change of changes)
      this.model.setCell(change.row, change.col, change.raw);
    this.undoStack.push({ kind: "cells", changes });
    this.redoStack = [];
  }

  applyFormats(writes: CellFormatWrite[]): void {
    const changes = writes
      .map((write) => {
        const before = this.model.hasFormat(write.row, write.col)
          ? { ...this.model.getFormat(write.row, write.col) }
          : undefined;
        const after = mergeFormat(before ?? {}, write.format);
        return { ...write, before, after };
      })
      .filter(
        (change) =>
          JSON.stringify(change.before ?? {}) !== JSON.stringify(change.after),
      );
    if (changes.length === 0) return;
    for (const change of changes)
      this.model.replaceFormat(change.row, change.col, change.after);
    this.undoStack.push({ kind: "formats", changes });
    this.redoStack = [];
  }

  applyAxisSizes(writes: AxisSizeWrite[]): void {
    const changes = writes
      .map((write) => ({
        ...write,
        before: this.model.getAxisSize(write.axis, write.index),
      }))
      .filter((change) => change.before !== change.size);
    if (changes.length === 0) return;
    for (const change of changes)
      this.model.setAxisSize(change.axis, change.index, change.size);
    this.undoStack.push({ kind: "axis-sizes", changes });
    this.redoStack = [];
  }

  /** Apply one structural document operation as a single undoable transaction. */
  applyStructure(operation: SheetStructureOperation): void {
    const before = this.model.toSnapshot();
    this.model.applyStructure(operation);
    const after = this.model.toSnapshot();
    this.undoStack.push({ kind: "structure", before, after });
    this.redoStack = [];
  }

  undo(): void {
    const changes = this.undoStack.pop();
    if (!changes) return;
    if (changes.kind === "cells") {
      for (const change of [...changes.changes].reverse())
        this.model.setCell(change.row, change.col, change.before);
    } else if (changes.kind === "formats") {
      for (const change of [...changes.changes].reverse())
        this.model.replaceFormat(change.row, change.col, change.before);
    } else if (changes.kind === "axis-sizes") {
      for (const change of [...changes.changes].reverse())
        this.model.setAxisSize(change.axis, change.index, change.before);
    } else {
      this.model.restoreSnapshot(changes.before);
    }
    this.redoStack.push(changes);
  }

  redo(): void {
    const changes = this.redoStack.pop();
    if (!changes) return;
    if (changes.kind === "cells") {
      for (const change of changes.changes)
        this.model.setCell(change.row, change.col, change.raw);
    } else if (changes.kind === "formats") {
      for (const change of changes.changes)
        this.model.replaceFormat(change.row, change.col, change.after);
    } else if (changes.kind === "axis-sizes") {
      for (const change of changes.changes)
        this.model.setAxisSize(change.axis, change.index, change.size);
    } else {
      this.model.restoreSnapshot(changes.after);
    }
    this.undoStack.push(changes);
  }
}
