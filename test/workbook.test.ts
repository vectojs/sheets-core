import { describe, expect, it } from "bun:test";
import { Workbook } from "../src/model/Workbook";

describe("Workbook", () => {
  it("owns ordered sheets, a stable active id, and unique names", () => {
    const workbook = new Workbook({ name: "Plan", rows: 20, cols: 10 });
    const budget = workbook.addSheet("Budget");

    expect(workbook.sheets.map((sheet) => sheet.name)).toEqual([
      "Plan",
      "Budget",
    ]);
    workbook.setActiveSheet(budget.id);
    expect(workbook.activeSheet.id).toBe(budget.id);

    workbook.renameSheet(budget.id, "Forecast");
    expect(workbook.getSheet(budget.id).name).toBe("Forecast");
    expect(() => workbook.addSheet("forecast")).toThrow("already exists");
  });

  it("round-trips raw cells and active-sheet selection through a versioned snapshot", () => {
    const workbook = new Workbook({ name: "Plan", rows: 20, cols: 10 });
    const budget = workbook.addSheet("Budget", { rows: 30, cols: 12 });
    workbook.activeSheet.model.setCell(0, 0, "=2+3");
    workbook.setActiveSheet(budget.id);
    workbook.activeSheet.model.setCell(2, 4, "42");

    const restored = Workbook.fromSnapshot(workbook.toSnapshot());

    expect(restored.activeSheet.id).toBe(budget.id);
    expect(restored.sheets.map((sheet) => sheet.name)).toEqual([
      "Plan",
      "Budget",
    ]);
    expect(restored.sheets[0].model.getDisplay(0, 0)).toBe("5");
    expect(restored.activeSheet.model.getRaw(2, 4)).toBe("42");
  });

  it("does not delete the final sheet", () => {
    const workbook = new Workbook();
    expect(() => workbook.deleteSheet(workbook.activeSheet.id)).toThrow(
      "last sheet",
    );
  });
});
