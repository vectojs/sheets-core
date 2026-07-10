import { SheetModel } from "./SheetModel";

/** A compact starting sheet that exposes literals, formulas and range totals. */
export function createDemoModel(): SheetModel {
  const model = new SheetModel();
  model.setCell(0, 0, "Month");
  model.setCell(0, 1, "Revenue");
  model.setCell(0, 2, "Forecast");
  for (const [row, month] of [
    "January",
    "February",
    "March",
    "April",
  ].entries()) {
    model.setCell(row + 1, 0, month);
    model.setCell(row + 1, 1, "1400");
    model.setCell(row + 1, 2, `=B${row + 2}*1.1`);
  }
  model.setCell(5, 0, "Total");
  model.setCell(5, 2, "=SUM(C2:C5)");
  return model;
}
