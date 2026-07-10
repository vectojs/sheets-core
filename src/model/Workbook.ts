import { SheetModel, type PopulatedCell } from "./SheetModel";

export interface WorkbookSheet {
  id: string;
  name: string;
  model: SheetModel;
}

export interface WorkbookSnapshotSheet {
  id: string;
  name: string;
  rows: number;
  cols: number;
  cells: PopulatedCell[];
}

export interface WorkbookSnapshot {
  version: 1;
  activeSheetId: string;
  sheets: WorkbookSnapshotSheet[];
}

export interface NewSheetOptions {
  name?: string;
  rows?: number;
  cols?: number;
}

/**
 * Pure ordered workbook document. It deliberately coordinates sheets without
 * taking ownership of rendering, browser storage, or UI interaction.
 */
export class Workbook {
  private readonly entries: WorkbookSheet[] = [];
  private nextId = 1;
  private activeId: string;

  constructor(options: NewSheetOptions = {}) {
    const first = this.createEntry(options.name ?? "Sheet 1", options);
    this.entries.push(first);
    this.activeId = first.id;
  }

  get sheets(): readonly WorkbookSheet[] {
    return this.entries;
  }

  get activeSheetId(): string {
    return this.activeId;
  }

  get activeSheet(): WorkbookSheet {
    return this.getSheet(this.activeId);
  }

  getSheet(id: string): WorkbookSheet {
    const sheet = this.entries.find((entry) => entry.id === id);
    if (!sheet) throw new RangeError(`Unknown sheet "${id}"`);
    return sheet;
  }

  addSheet(
    name?: string,
    options: Omit<NewSheetOptions, "name"> = {},
  ): WorkbookSheet {
    const sheet = this.createEntry(name ?? this.nextSheetName(), options);
    this.entries.push(sheet);
    return sheet;
  }

  setActiveSheet(id: string): void {
    this.getSheet(id);
    this.activeId = id;
  }

  renameSheet(id: string, name: string): void {
    const sheet = this.getSheet(id);
    sheet.name = this.validateName(name, id);
  }

  deleteSheet(id: string): WorkbookSheet {
    if (this.entries.length === 1)
      throw new RangeError("A workbook must retain its last sheet");
    const index = this.entries.findIndex((entry) => entry.id === id);
    if (index < 0) throw new RangeError(`Unknown sheet "${id}"`);
    const [removed] = this.entries.splice(index, 1);
    if (this.activeId === id)
      this.activeId = this.entries[Math.max(0, index - 1)].id;
    return removed;
  }

  toSnapshot(): WorkbookSnapshot {
    return {
      version: 1,
      activeSheetId: this.activeId,
      sheets: this.entries.map((sheet) => ({
        id: sheet.id,
        name: sheet.name,
        rows: sheet.model.rows,
        cols: sheet.model.cols,
        cells: sheet.model.getCellsInRange({
          r1: 0,
          c1: 0,
          r2: sheet.model.rows - 1,
          c2: sheet.model.cols - 1,
        }),
      })),
    };
  }

  static fromSnapshot(snapshot: WorkbookSnapshot): Workbook {
    if (snapshot.version !== 1 || snapshot.sheets.length === 0)
      throw new RangeError("Unsupported or empty workbook snapshot");
    const [first, ...rest] = snapshot.sheets;
    const workbook = new Workbook({
      name: first.name,
      rows: first.rows,
      cols: first.cols,
    });
    workbook.entries[0].id = first.id;
    workbook.restoreCells(workbook.entries[0], first.cells);
    for (const source of rest) {
      const entry = workbook.createEntry(source.name, {
        rows: source.rows,
        cols: source.cols,
      });
      entry.id = source.id;
      workbook.entries.push(entry);
      workbook.restoreCells(entry, source.cells);
    }
    workbook.nextId = 1;
    workbook.setActiveSheet(snapshot.activeSheetId);
    return workbook;
  }

  private restoreCells(sheet: WorkbookSheet, cells: PopulatedCell[]): void {
    for (const cell of cells) sheet.model.setCell(cell.row, cell.col, cell.raw);
  }

  private createEntry(name: string, options: NewSheetOptions): WorkbookSheet {
    let id = `sheet-${this.nextId++}`;
    while (this.entries.some((entry) => entry.id === id))
      id = `sheet-${this.nextId++}`;
    return {
      id,
      name: this.validateName(name),
      model: new SheetModel(options.rows, options.cols),
    };
  }

  private validateName(name: string, excludingId?: string): string {
    const normalized = name.trim();
    if (!normalized) throw new RangeError("Sheet name cannot be empty");
    if (normalized.length > 100) throw new RangeError("Sheet name is too long");
    if (
      this.entries.some(
        (entry) =>
          entry.id !== excludingId &&
          entry.name.localeCompare(normalized, undefined, {
            sensitivity: "accent",
          }) === 0,
      )
    ) {
      throw new RangeError(`A sheet named "${normalized}" already exists`);
    }
    return normalized;
  }

  private nextSheetName(): string {
    let number = this.entries.length + 1;
    while (this.entries.some((sheet) => sheet.name === `Sheet ${number}`))
      number++;
    return `Sheet ${number}`;
  }
}
