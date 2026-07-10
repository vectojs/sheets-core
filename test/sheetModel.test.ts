import { describe, it, expect } from "bun:test";
import { SheetModel } from "../src/model/SheetModel";

describe("SheetModel basics", () => {
  it("stores literals, coerces numbers, and displays cleanly", () => {
    const m = new SheetModel();
    m.setCell(0, 0, "42");
    m.setCell(0, 1, "hello");
    m.setCell(0, 2, "  3.5 ");
    expect(m.getValue(0, 0)).toBe(42);
    expect(m.getValue(0, 1)).toBe("hello");
    expect(m.getValue(0, 2)).toBe(3.5);
    expect(m.getDisplay(0, 0)).toBe("42");
    expect(m.getDisplay(9, 9)).toBe("");
    expect(m.cellCount).toBe(3);
  });

  it("clears cells on empty input", () => {
    const m = new SheetModel();
    m.setCell(0, 0, "1");
    m.setCell(0, 0, "");
    expect(m.getValue(0, 0)).toBeNull();
    expect(m.cellCount).toBe(0);
  });

  it("evaluates formulas and keeps raw text", () => {
    const m = new SheetModel();
    m.setCell(0, 0, "2");
    m.setCell(0, 1, "=A1*3");
    expect(m.getValue(0, 1)).toBe(6);
    expect(m.getRaw(0, 1)).toBe("=A1*3");
    expect(m.getDisplay(0, 1)).toBe("6");
  });

  it("shows #ERROR! for unparseable formulas", () => {
    const m = new SheetModel();
    m.setCell(0, 0, "=2+");
    expect(m.getDisplay(0, 0)).toBe("#ERROR!");
  });
});

describe("dependency recalculation", () => {
  it("recalculates direct and transitive scalar dependents", () => {
    const m = new SheetModel();
    m.setCell(0, 0, "1"); // A1
    m.setCell(0, 1, "=A1+1"); // B1
    m.setCell(0, 2, "=B1*10"); // C1
    expect(m.getValue(0, 2)).toBe(20);
    m.setCell(0, 0, "5");
    expect(m.getValue(0, 1)).toBe(6);
    expect(m.getValue(0, 2)).toBe(60);
  });

  it("recalculates range dependents without expanding the range", () => {
    const m = new SheetModel();
    m.setCell(0, 0, "1"); // A1
    m.setCell(1, 0, "2"); // A2
    m.setCell(0, 5, "=SUM(A1:A10000)"); // F1 — one rect, not 10k edges
    expect(m.getValue(0, 5)).toBe(3);
    m.setCell(9999, 0, "100"); // bottom of the range
    expect(m.getValue(0, 5)).toBe(103);
    m.setCell(1, 1, "999"); // B2 — outside the range
    expect(m.getValue(0, 5)).toBe(103);
  });

  it("rewires dependencies when a formula is edited", () => {
    const m = new SheetModel();
    m.setCell(0, 0, "1"); // A1
    m.setCell(1, 0, "10"); // A2
    m.setCell(0, 1, "=A1"); // B1
    m.setCell(0, 1, "=A2"); // now depends on A2, not A1
    m.setCell(0, 0, "7");
    expect(m.getValue(0, 1)).toBe(10); // unaffected by A1 edit
    m.setCell(1, 0, "20");
    expect(m.getValue(0, 1)).toBe(20);
  });

  it("detects direct and indirect cycles and recovers after the break", () => {
    const m = new SheetModel();
    m.setCell(0, 0, "=B1"); // A1 → B1
    m.setCell(0, 1, "=A1"); // B1 → A1: cycle
    expect(m.getDisplay(0, 0)).toBe("#CYCLE!");
    expect(m.getDisplay(0, 1)).toBe("#CYCLE!");

    m.setCell(0, 1, "3"); // break the cycle
    expect(m.getValue(0, 0)).toBe(3);
    expect(m.getValue(0, 1)).toBe(3);

    // Indirect: A→B→C→A
    m.setCell(1, 0, "=B2"); // A2 → B2
    m.setCell(1, 1, "=C2"); // B2 → C2
    m.setCell(1, 2, "=A2"); // C2 → A2
    expect(m.getDisplay(1, 0)).toBe("#CYCLE!");
    expect(m.getDisplay(1, 1)).toBe("#CYCLE!");
    expect(m.getDisplay(1, 2)).toBe("#CYCLE!");
  });

  it("returns #REF! for out-of-bounds references", () => {
    const m = new SheetModel(10, 10);
    m.setCell(0, 0, "=Z99");
    expect(m.getDisplay(0, 0)).toBe("#REF!");
  });

  it("notifies listeners on every edit", () => {
    const m = new SheetModel();
    let calls = 0;
    const off = m.onChange(() => calls++);
    m.setCell(0, 0, "1");
    m.setCell(0, 1, "2");
    off();
    m.setCell(0, 2, "3");
    expect(calls).toBe(2);
  });
});
