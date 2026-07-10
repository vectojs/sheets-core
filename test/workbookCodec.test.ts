import { describe, expect, it } from "bun:test";
import {
  fromCsv,
  parseWorkbookJson,
  toCsv,
  toWorkbookJson,
} from "../src/model/WorkbookCodec";
import { SheetModel } from "../src/model/SheetModel";
import { Workbook } from "../src/model/Workbook";

describe("WorkbookCodec", () => {
  it("round-trips a versioned workbook JSON document", () => {
    const workbook = new Workbook({ name: "Plan" });
    workbook.activeSheet.model.setCell(0, 0, "=2+3");
    workbook.activeSheet.model.setFormat(0, 0, { bold: true });

    const restored = parseWorkbookJson(toWorkbookJson(workbook));

    expect(restored.activeSheet.name).toBe("Plan");
    expect(restored.activeSheet.model.getDisplay(0, 0)).toBe("5");
    expect(restored.activeSheet.model.getFormat(0, 0).bold).toBe(true);
  });

  it("encodes quoted CSV fields and imports them as bounded raw writes", () => {
    const model = new SheetModel(10, 10);
    model.setCell(0, 0, '"Quoted", value');
    model.setCell(0, 1, "=1+2");
    model.setCell(1, 0, "next");

    const csv = toCsv(model, { r1: 0, c1: 0, r2: 1, c2: 1 });
    expect(csv).toBe('"""Quoted"", value",=1+2\r\nnext,');
    expect(fromCsv(csv, { row: 3, col: 2 }, model)).toEqual([
      { row: 3, col: 2, raw: '"Quoted", value' },
      { row: 3, col: 3, raw: "=1+2" },
      { row: 4, col: 2, raw: "next" },
      { row: 4, col: 3, raw: "" },
    ]);
  });
});
