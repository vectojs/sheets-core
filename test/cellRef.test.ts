import { describe, it, expect } from "bun:test";
import {
  colName,
  colIndex,
  parseA1,
  toA1,
  parseRange,
  rectContains,
} from "../src/model/cellRef";

describe("colName / colIndex", () => {
  it("round-trips single and double letters", () => {
    expect(colName(0)).toBe("A");
    expect(colName(25)).toBe("Z");
    expect(colName(26)).toBe("AA");
    expect(colName(99)).toBe("CV");
    for (const c of [0, 1, 25, 26, 51, 52, 99, 701, 702]) {
      expect(colIndex(colName(c))).toBe(c);
    }
  });
});

describe("parseA1 / toA1", () => {
  it("parses plain and absolute refs, rejects junk", () => {
    expect(parseA1("A1")).toEqual({ row: 0, col: 0 });
    expect(parseA1("B3")).toEqual({ row: 2, col: 1 });
    expect(parseA1("$B$3")).toEqual({ row: 2, col: 1 });
    expect(parseA1("CV10000")).toEqual({ row: 9999, col: 99 });
    expect(parseA1("1A")).toBeNull();
    expect(parseA1("A0")).toBeNull();
    expect(parseA1("")).toBeNull();
    expect(toA1({ row: 2, col: 1 })).toBe("B3");
  });
});

describe("parseRange", () => {
  it("normalizes corners regardless of order", () => {
    expect(parseRange("A1:B5")).toEqual({ r1: 0, c1: 0, r2: 4, c2: 1 });
    expect(parseRange("B5:A1")).toEqual({ r1: 0, c1: 0, r2: 4, c2: 1 });
    expect(parseRange("A1")).toBeNull();
  });

  it("rectContains covers edges inclusively", () => {
    const rect = parseRange("B2:C4")!;
    expect(rectContains(rect, 1, 1)).toBe(true);
    expect(rectContains(rect, 3, 2)).toBe(true);
    expect(rectContains(rect, 0, 1)).toBe(false);
    expect(rectContains(rect, 4, 2)).toBe(false);
  });
});
