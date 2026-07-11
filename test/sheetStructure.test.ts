import { describe, expect, it } from "bun:test";
import {
  translateFormulaReferences,
  transformFormulaReferences,
  type SheetStructureOperation,
} from "../src/model/SheetStructure";
import { SheetModel } from "../src/model/SheetModel";

describe("structural formula source transforms", () => {
  it("moves scalar and range row references while preserving absolute markers", () => {
    const operation: SheetStructureOperation = {
      kind: "insert",
      axis: "row",
      index: 1,
      count: 2,
    };

    expect(transformFormulaReferences("=A1+$B$3+SUM(A1:B5)", operation)).toBe(
      "=A1+$B$5+SUM(A1:B7)",
    );
  });

  it("moves column references without changing row coordinates", () => {
    const operation: SheetStructureOperation = {
      kind: "insert",
      axis: "column",
      index: 1,
      count: 2,
    };

    expect(transformFormulaReferences("=A1+B$2+$C3", operation)).toBe(
      "=A1+D$2+$E3",
    );
  });

  it("does not reinterpret A1-looking text inside a string literal", () => {
    const operation: SheetStructureOperation = {
      kind: "insert",
      axis: "row",
      index: 0,
      count: 1,
    };

    expect(transformFormulaReferences('="A1 is a label"&A1', operation)).toBe(
      '="A1 is a label"&A2',
    );
  });

  it("contracts a range around deleted rows and marks a deleted scalar ref", () => {
    const operation: SheetStructureOperation = {
      kind: "delete",
      axis: "row",
      index: 2,
      count: 1,
    };

    expect(transformFormulaReferences("=A3+SUM(A1:A5)", operation)).toBe(
      "=#REF!+SUM(A1:A4)",
    );
  });

  it("marks a range as #REF! when deletion removes every referenced cell", () => {
    const operation: SheetStructureOperation = {
      kind: "delete",
      axis: "column",
      index: 0,
      count: 2,
    };

    expect(transformFormulaReferences("=SUM(A1:B2)", operation)).toBe(
      "=SUM(#REF!)",
    );
  });
});

describe("fill formula source translation", () => {
  it("moves only relative dimensions in scalar and range references", () => {
    expect(
      translateFormulaReferences('=A1+$B1+C$2+$D$4+SUM(A1:B2)&"A1"', 1, 2, {
        rows: 20,
        cols: 20,
      }),
    ).toBe('=C2+$B2+E$2+$D$4+SUM(C2:D3)&"A1"');
  });

  it("supports reverse movement and marks out-of-bounds references", () => {
    expect(
      translateFormulaReferences("=B2+A1+SUM(B2:C3)", -1, -1, {
        rows: 5,
        cols: 5,
      }),
    ).toBe("=A1+#REF!+SUM(A1:B2)");
  });

  it("preserves the valid endpoint of a partially invalid range", () => {
    expect(
      translateFormulaReferences("=SUM(A1:B2)", 0, -1, {
        rows: 5,
        cols: 5,
      }),
    ).toBe("=SUM(#REF!:A2)");
    expect(
      translateFormulaReferences("=SUM(D4:E5)", 0, 1, {
        rows: 5,
        cols: 5,
      }),
    ).toBe("=SUM(E4:#REF!)");
  });

  it("does not reinterpret function names or A1-looking string text", () => {
    expect(
      translateFormulaReferences('=LOG10(A1)&"B2"', 1, 1, {
        rows: 5,
        cols: 5,
      }),
    ).toBe('=LOG10(B2)&"B2"');
  });
});

describe("SheetModel structural operations", () => {
  it("inserts sparse rows, shifts formulas, and preserves format-only cells", () => {
    const model = new SheetModel(5, 4);
    model.setCell(0, 0, "10");
    model.setCell(2, 0, "20");
    model.setCell(3, 1, "=A3+A1");
    model.setFormat(4, 3, { background: "#fef3c7" });

    model.applyStructure({
      kind: "insert",
      axis: "row",
      index: 1,
      count: 2,
    });

    expect(model.rows).toBe(7);
    expect(model.getRaw(0, 0)).toBe("10");
    expect(model.getRaw(4, 0)).toBe("20");
    expect(model.getRaw(5, 1)).toBe("=A5+A1");
    expect(model.getValue(5, 1)).toBe(30);
    expect(model.getFormat(6, 3).background).toBe("#fef3c7");
    expect(model.cellCount).toBe(4);
  });

  it("moves matching sparse axis-size overrides with row and column structure", () => {
    const model = new SheetModel(5, 4);
    model.rowMetrics.set(0, 30);
    model.rowMetrics.set(2, 40);
    model.columnMetrics.set(1, 160);
    model.columnMetrics.set(3, 180);

    model.applyStructure({
      kind: "insert",
      axis: "row",
      index: 1,
      count: 2,
    });
    expect(model.rowMetrics.entries()).toEqual([
      { index: 0, size: 30 },
      { index: 4, size: 40 },
    ]);
    expect(model.columnMetrics.entries()).toEqual([
      { index: 1, size: 160 },
      { index: 3, size: 180 },
    ]);

    model.applyStructure({
      kind: "delete",
      axis: "column",
      index: 1,
      count: 2,
    });
    expect(model.columnMetrics.entries()).toEqual([{ index: 1, size: 180 }]);
  });

  it("deletes rows, contracts surviving formula ranges, and keeps the model sparse", () => {
    const model = new SheetModel(6, 3);
    model.setCell(0, 0, "1");
    model.setCell(1, 0, "2");
    model.setCell(2, 0, "3");
    model.setCell(3, 0, "4");
    model.setCell(4, 1, "=SUM(A1:A4)");
    model.setCell(5, 2, "=A3");

    model.applyStructure({
      kind: "delete",
      axis: "row",
      index: 2,
      count: 1,
    });

    expect(model.rows).toBe(5);
    expect(model.getRaw(2, 0)).toBe("4");
    expect(model.getRaw(3, 1)).toBe("=SUM(A1:A3)");
    expect(model.getValue(3, 1)).toBe(7);
    expect(model.getRaw(4, 2)).toBe("=#REF!");
    expect(model.getDisplay(4, 2)).toBe("#REF!");
    expect(model.cellCount).toBe(5);
  });

  it("inserts and deletes columns without allowing the final column to disappear", () => {
    const model = new SheetModel(3, 3);
    model.setCell(0, 0, "1");
    model.setCell(0, 1, "2");
    model.setCell(1, 2, "=A1+B1");

    model.applyStructure({
      kind: "insert",
      axis: "column",
      index: 1,
      count: 1,
    });
    expect(model.cols).toBe(4);
    expect(model.getRaw(0, 2)).toBe("2");
    expect(model.getRaw(1, 3)).toBe("=A1+C1");

    model.applyStructure({
      kind: "delete",
      axis: "column",
      index: 1,
      count: 1,
    });
    expect(model.cols).toBe(3);
    expect(model.getRaw(0, 1)).toBe("2");
    expect(model.getRaw(1, 2)).toBe("=A1+B1");
    expect(() =>
      model.applyStructure({
        kind: "delete",
        axis: "column",
        index: 0,
        count: 3,
      }),
    ).toThrow("last column");
  });
});
