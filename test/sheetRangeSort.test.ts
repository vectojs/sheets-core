import { describe, expect, it } from "bun:test";
import { SheetHistory, SheetModel, sortRange } from "../src";

describe("sortRange", () => {
  it("stably sorts complete rows by computed values and translates formulas", () => {
    const model = new SheetModel(20, 10);
    const history = new SheetHistory(model);
    seedRow(model, 1, "Beta", "20", "=B2*2", "#fee2e2");
    seedRow(model, 2, "Alpha", "10", "=B3*2", "#dcfce7");
    seedRow(model, 3, "Alpha", "15", "=B4*2", "#dbeafe");

    history.applyCellStates(
      sortRange(model, { r1: 1, c1: 0, r2: 3, c2: 2 }, 0, "ascending"),
    );

    expect(rows(model, 1, 3)).toEqual([
      ["Alpha", "10", "=B2*2"],
      ["Alpha", "15", "=B3*2"],
      ["Beta", "20", "=B4*2"],
    ]);
    expect(model.getDisplay(1, 2)).toBe("20");
    expect(model.getDisplay(2, 2)).toBe("30");
    expect(model.getDisplay(3, 2)).toBe("40");
    expect(model.getFormat(1, 0)).toEqual({ background: "#dcfce7" });
    expect(model.getFormat(2, 0)).toEqual({ background: "#dbeafe" });
    expect(model.getFormat(3, 0)).toEqual({ background: "#fee2e2" });

    history.undo();
    expect(rows(model, 1, 3)).toEqual([
      ["Beta", "20", "=B2*2"],
      ["Alpha", "10", "=B3*2"],
      ["Alpha", "15", "=B4*2"],
    ]);
    expect(model.getFormat(1, 0)).toEqual({ background: "#fee2e2" });
  });

  it("sorts numbers before text and keeps blank keys last in either direction", () => {
    const model = new SheetModel(20, 10);
    model.setCell(0, 0, "10");
    model.setCell(0, 1, "number");
    model.setCell(1, 0, "apple");
    model.setCell(1, 1, "text");
    model.setCell(2, 1, "blank");
    model.setCell(3, 0, "2");
    model.setCell(3, 1, "small number");

    const ascending = sortRange(
      model,
      { r1: 0, c1: 0, r2: 3, c2: 1 },
      0,
      "ascending",
    );
    new SheetHistory(model).applyCellStates(ascending);
    expect(rows(model, 0, 3, 2)).toEqual([
      ["2", "small number"],
      ["10", "number"],
      ["apple", "text"],
      ["", "blank"],
    ]);

    const descending = sortRange(
      model,
      { r1: 0, c1: 0, r2: 3, c2: 1 },
      0,
      "descending",
    );
    new SheetHistory(model).applyCellStates(descending);
    expect(rows(model, 0, 3, 2)).toEqual([
      ["apple", "text"],
      ["10", "number"],
      ["2", "small number"],
      ["", "blank"],
    ]);
  });

  it("rejects a key outside the sorted range", () => {
    const model = new SheetModel(20, 10);
    expect(() =>
      sortRange(model, { r1: 0, c1: 1, r2: 2, c2: 3 }, 0, "ascending"),
    ).toThrow("key column");
  });
});

function seedRow(
  model: SheetModel,
  row: number,
  label: string,
  value: string,
  formula: string,
  background: string,
): void {
  model.setCell(row, 0, label);
  model.setCell(row, 1, value);
  model.setCell(row, 2, formula);
  model.setFormat(row, 0, { background });
}

function rows(
  model: SheetModel,
  first: number,
  last: number,
  columns = 3,
): string[][] {
  return Array.from({ length: last - first + 1 }, (_, offset) => {
    const row = first + offset;
    return Array.from({ length: columns }, (_, col) => model.getRaw(row, col));
  });
}
