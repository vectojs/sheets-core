import { describe, expect, it } from "bun:test";
import { SheetHistory } from "../src/model/SheetHistory";
import { captureRange, transferRange } from "../src/model/SheetRangeTransfer";
import { SheetModel } from "../src/model/SheetModel";

describe("sheet range transfer", () => {
  it("aligns reverse fill patterns to the captured source origin", () => {
    const model = new SheetModel(2, 4);
    model.setCell(0, 1, "X");
    model.setCell(0, 2, "Y");
    const payload = captureRange(model, { r1: 0, c1: 1, r2: 0, c2: 2 });

    const writes = transferRange(
      payload,
      { r1: 0, c1: 0, r2: 0, c2: 2 },
      model,
    );

    expect(writes.map(({ raw }) => raw)).toEqual(["Y", "X", "Y"]);
  });

  it("rejects malformed public payload dimensions and offsets", () => {
    const bounds = { rows: 3, cols: 3 };
    expect(() =>
      transferRange(
        { origin: { row: 0, col: 0 }, rows: 0, cols: 1, cells: [] },
        { r1: 0, c1: 0, r2: 0, c2: 0 },
        bounds,
      ),
    ).toThrow("payload");
    expect(() =>
      transferRange(
        {
          origin: { row: 0, col: 0 },
          rows: 1,
          cols: 1,
          cells: [{ rowOffset: 1, colOffset: 0, raw: "invalid" }],
        },
        { r1: 0, c1: 0, r2: 0, c2: 0 },
        bounds,
      ),
    ).toThrow("payload");
  });

  it("keeps a logically dense source sparse in memory", () => {
    const model = new SheetModel(100, 100);
    model.setCell(99, 99, "edge");

    const payload = captureRange(model, {
      r1: 0,
      c1: 0,
      r2: 99,
      c2: 99,
    });

    expect(payload.cells).toHaveLength(1);
  });

  it("tiles dense values, translated formulas, and exact formats", () => {
    const model = new SheetModel(5, 6);
    model.setCell(0, 0, "1");
    model.setFormat(0, 0, { bold: true });
    model.setCell(0, 1, "=A1+$A$1");
    model.setFormat(0, 1, { background: "#fef3c7" });
    const payload = captureRange(model, { r1: 0, c1: 0, r2: 0, c2: 1 });

    const writes = transferRange(
      payload,
      { r1: 1, c1: 0, r2: 2, c2: 3 },
      { rows: model.rows, cols: model.cols },
    );

    expect(writes).toHaveLength(8);
    expect(writes.find(({ row, col }) => row === 1 && col === 1)).toEqual({
      row: 1,
      col: 1,
      raw: "=A2+$A$1",
      format: { background: "#fef3c7" },
    });
    expect(writes.find(({ row, col }) => row === 2 && col === 3)?.raw).toBe(
      "=C3+$A$1",
    );
    expect(
      writes.find(({ row, col }) => row === 2 && col === 2)?.format,
    ).toEqual({ bold: true });
  });

  it("applies values and exact formats as one undoable history entry", () => {
    const model = new SheetModel(4, 4);
    model.setCell(0, 0, "source");
    model.setFormat(0, 0, { bold: true });
    model.setCell(1, 1, "before");
    model.setFormat(1, 1, { italic: true });
    const history = new SheetHistory(model);
    const payload = captureRange(model, { r1: 0, c1: 0, r2: 0, c2: 0 });

    history.applyCellStates(
      transferRange(payload, { r1: 1, c1: 1, r2: 1, c2: 1 }, model),
    );
    expect(model.getRaw(1, 1)).toBe("source");
    expect(model.getFormat(1, 1)).toEqual({ bold: true });

    history.undo();
    expect(model.getRaw(1, 1)).toBe("before");
    expect(model.getFormat(1, 1)).toEqual({ italic: true });

    history.redo();
    expect(model.getRaw(1, 1)).toBe("source");
    expect(model.getFormat(1, 1)).toEqual({ bold: true });
  });

  it("captures empty source cells so transfer clears destination state", () => {
    const model = new SheetModel(3, 3);
    model.setCell(1, 1, "remove");
    model.setFormat(1, 1, { italic: true });
    const history = new SheetHistory(model);
    const payload = captureRange(model, { r1: 0, c1: 0, r2: 0, c2: 0 });

    history.applyCellStates(
      transferRange(payload, { r1: 1, c1: 1, r2: 1, c2: 1 }, model),
    );
    expect(model.getRaw(1, 1)).toBe("");
    expect(model.hasFormat(1, 1)).toBe(false);
  });
});
