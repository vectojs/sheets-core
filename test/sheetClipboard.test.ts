import { describe, expect, it } from "bun:test";
import { copyRange, pasteText } from "../src/model/SheetClipboard";
import { SheetModel } from "../src/model/SheetModel";

describe("SheetClipboard", () => {
  it("copies raw cells as TSV so formulas survive a sheet-to-sheet paste", () => {
    const model = new SheetModel();
    model.setCell(0, 0, "1");
    model.setCell(0, 1, "=A1+1");
    model.setCell(1, 0, "hello");

    expect(copyRange(model, { r1: 0, c1: 0, r2: 1, c2: 1 })).toBe(
      "1\t=A1+1\nhello\t",
    );
  });

  it("parses TSV into bounded writes anchored at the target cell", () => {
    expect(
      pasteText("a\tb\n1\t2", { row: 8, col: 8 }, { rows: 10, cols: 10 }),
    ).toEqual([
      { row: 8, col: 8, raw: "a" },
      { row: 8, col: 9, raw: "b" },
      { row: 9, col: 8, raw: "1" },
      { row: 9, col: 9, raw: "2" },
    ]);
  });
});
