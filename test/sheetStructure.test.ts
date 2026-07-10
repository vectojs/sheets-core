import { describe, expect, it } from "bun:test";
import {
  transformFormulaReferences,
  type SheetStructureOperation,
} from "../src/model/SheetStructure";

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
