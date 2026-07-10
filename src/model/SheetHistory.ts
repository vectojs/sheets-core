import { SheetModel } from "./SheetModel";

export interface CellWrite {
  row: number;
  col: number;
  raw: string;
}

interface CellChange extends CellWrite {
  before: string;
}

/**
 * Transactional undo/redo for document operations. The UI, clipboard and a
 * future MCP surface all submit the same `CellWrite[]` shape, never Canvas
 * state, so history remains deterministic and independently testable.
 */
export class SheetHistory {
  private undoStack: CellChange[][] = [];
  private redoStack: CellChange[][] = [];

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
    this.undoStack.push(changes);
    this.redoStack = [];
  }

  undo(): void {
    const changes = this.undoStack.pop();
    if (!changes) return;
    for (const change of [...changes].reverse())
      this.model.setCell(change.row, change.col, change.before);
    this.redoStack.push(changes);
  }

  redo(): void {
    const changes = this.redoStack.pop();
    if (!changes) return;
    for (const change of changes)
      this.model.setCell(change.row, change.col, change.raw);
    this.undoStack.push(changes);
  }
}
