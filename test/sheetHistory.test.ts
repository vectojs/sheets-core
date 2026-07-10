import { describe, expect, it } from "bun:test";
import { SheetHistory } from "../src/model/SheetHistory";
import { SheetModel } from "../src/model/SheetModel";

describe("SheetHistory", () => {
  it("undoes and redoes a grouped cell edit transaction", () => {
    const model = new SheetModel();
    model.setCell(0, 0, "before");
    const history = new SheetHistory(model);

    history.apply([
      { row: 0, col: 0, raw: "after" },
      { row: 0, col: 1, raw: "=A1" },
    ]);

    expect(model.getDisplay(0, 0)).toBe("after");
    expect(model.getDisplay(0, 1)).toBe("after");
    expect(history.canUndo).toBe(true);

    history.undo();
    expect(model.getRaw(0, 0)).toBe("before");
    expect(model.getRaw(0, 1)).toBe("");
    expect(history.canRedo).toBe(true);

    history.redo();
    expect(model.getRaw(0, 0)).toBe("after");
    expect(model.getRaw(0, 1)).toBe("=A1");
  });

  it("drops a redo branch after a new transaction", () => {
    const model = new SheetModel();
    const history = new SheetHistory(model);
    history.apply([{ row: 0, col: 0, raw: "one" }]);
    history.undo();
    history.apply([{ row: 0, col: 0, raw: "two" }]);

    expect(history.canRedo).toBe(false);
    expect(model.getRaw(0, 0)).toBe("two");
  });
});
