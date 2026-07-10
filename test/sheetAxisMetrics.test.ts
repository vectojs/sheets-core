import { describe, expect, it } from "bun:test";
import { SheetAxisMetrics, SheetModel } from "../src";

describe("SheetAxisMetrics", () => {
  it("keeps default-sized axes implicit and exposes sorted sparse overrides", () => {
    const metrics = new SheetAxisMetrics(8, 24);

    expect(metrics.get(3)).toBe(24);
    metrics.set(3, 40);
    metrics.set(1, 32);
    expect(metrics.entries()).toEqual([
      { index: 1, size: 32 },
      { index: 3, size: 40 },
    ]);

    metrics.set(3, 24);
    expect(metrics.entries()).toEqual([{ index: 1, size: 32 }]);
    metrics.reset(1);
    expect(metrics.entries()).toEqual([]);
  });

  it("rejects invalid axis bounds and sizes", () => {
    const metrics = new SheetAxisMetrics(2, 24);

    expect(() => metrics.get(2)).toThrow(RangeError);
    expect(() => metrics.set(-1, 24)).toThrow(RangeError);
    expect(() => metrics.set(0, 0)).toThrow(RangeError);
    expect(() => metrics.set(0, Number.NaN)).toThrow(RangeError);
  });

  it("persists sparse axis overrides in a sheet snapshot", () => {
    const model = new SheetModel(10, 5);
    model.rowMetrics.set(3, 40);
    model.columnMetrics.set(2, 160);

    const snapshot = model.toSnapshot();
    expect(snapshot.rowMetrics).toEqual({
      defaultSize: 24,
      overrides: [{ index: 3, size: 40 }],
    });
    expect(snapshot.columnMetrics).toEqual({
      defaultSize: 112,
      overrides: [{ index: 2, size: 160 }],
    });

    const restored = new SheetModel();
    restored.restoreSnapshot(snapshot);
    expect(restored.rowMetrics.entries()).toEqual([{ index: 3, size: 40 }]);
    expect(restored.columnMetrics.entries()).toEqual([{ index: 2, size: 160 }]);
  });
});
