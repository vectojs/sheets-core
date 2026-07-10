export type HorizontalAlign = "left" | "center" | "right";
export type NumberFormat = "general" | "number" | "currency" | "percent";

/** Persisted visual semantics of one spreadsheet cell; unset fields inherit defaults. */
export interface CellFormat {
  background?: string;
  foreground?: string;
  bold?: boolean;
  italic?: boolean;
  horizontalAlign?: HorizontalAlign;
  numberFormat?: NumberFormat;
}

export function mergeFormat(
  current: CellFormat,
  patch: CellFormat,
): CellFormat {
  return { ...current, ...patch };
}
