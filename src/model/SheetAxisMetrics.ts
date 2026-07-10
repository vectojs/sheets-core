export interface SheetAxisMetricEntry {
  index: number;
  size: number;
}

export type SheetAxis = "row" | "column";

export interface SheetAxisMetricsSnapshot {
  defaultSize: number;
  overrides: SheetAxisMetricEntry[];
}

/** Default logical sizes shared by the document and Canvas viewport adapters. */
export const DEFAULT_ROW_SIZE = 24;
export const DEFAULT_COLUMN_SIZE = 112;

/**
 * Sparse logical axis metrics. Default-size entries are deliberately absent so
 * a large sheet preserves only user-resized axes in its document snapshot.
 */
export class SheetAxisMetrics {
  private readonly overrides = new Map<number, number>();

  constructor(
    private length: number,
    private defaultSize: number,
  ) {
    validateLength(length);
    validateSize(defaultSize);
  }

  get axisLength(): number {
    return this.length;
  }

  get default(): number {
    return this.defaultSize;
  }

  get(index: number): number {
    this.validateIndex(index);
    return this.overrides.get(index) ?? this.defaultSize;
  }

  set(index: number, size: number): void {
    this.validateIndex(index);
    validateSize(size);
    if (size === this.defaultSize) this.overrides.delete(index);
    else this.overrides.set(index, size);
  }

  reset(index: number): void {
    this.validateIndex(index);
    this.overrides.delete(index);
  }

  entries(): SheetAxisMetricEntry[] {
    return [...this.overrides]
      .map(([index, size]) => ({ index, size }))
      .sort((left, right) => left.index - right.index);
  }

  toSnapshot(): SheetAxisMetricsSnapshot {
    return { defaultSize: this.defaultSize, overrides: this.entries() };
  }

  clone(): SheetAxisMetrics {
    return SheetAxisMetrics.fromSnapshot(this.length, this.toSnapshot());
  }

  static fromSnapshot(
    length: number,
    snapshot: SheetAxisMetricsSnapshot,
  ): SheetAxisMetrics {
    validateLength(length);
    validateSize(snapshot.defaultSize);
    const metrics = new SheetAxisMetrics(length, snapshot.defaultSize);
    for (const entry of snapshot.overrides) {
      if (
        !Number.isInteger(entry.index) ||
        entry.index < 0 ||
        entry.index >= length
      )
        throw new RangeError("Axis metric override is outside sheet bounds");
      metrics.set(entry.index, entry.size);
    }
    return metrics;
  }

  private validateIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.length)
      throw new RangeError("Axis index is outside sheet bounds");
  }
}

function validateLength(length: number): void {
  if (!Number.isInteger(length) || length < 1)
    throw new RangeError("Axis length must be a positive integer");
}

function validateSize(size: number): void {
  if (!Number.isFinite(size) || size <= 0)
    throw new RangeError("Axis size must be a finite positive number");
}
