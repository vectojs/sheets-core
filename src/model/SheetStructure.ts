import { colIndex, colName, type CellPos } from "./cellRef";

export type SheetStructureOperation =
  | {
      kind: "insert";
      axis: "row" | "column";
      index: number;
      count: number;
    }
  | {
      kind: "delete";
      axis: "row" | "column";
      index: number;
      count: number;
    };

interface ParsedReference {
  position: CellPos;
  columnAbsolute: boolean;
  rowAbsolute: boolean;
  length: number;
}

const REFERENCE_RE = /^(\$?)([A-Z]{1,3})(\$?)(\d+)/;

/**
 * Rewrite A1 references in formula source for a structural operation. This is
 * intentionally source-level: retaining `$` markers is required for future
 * fill behavior even though structure changes move absolute targets too.
 */
export function transformFormulaReferences(
  source: string,
  operation: SheetStructureOperation,
): string {
  return rewriteFormulaReferences(
    source,
    (reference) => transformScalar(reference, operation),
    (start, end) => transformRange(start, end, operation),
  );
}

/** Translate relative A1 dimensions for fill/copy while preserving `$` markers. */
export function translateFormulaReferences(
  source: string,
  rowDelta: number,
  colDelta: number,
  bounds: { rows: number; cols: number },
): string {
  return rewriteFormulaReferences(
    source,
    (reference) => {
      const position = translateReference(
        reference,
        rowDelta,
        colDelta,
        bounds,
      );
      return position ? formatReference(position, reference) : "#REF!";
    },
    (start, end) => {
      const translatedStart = translateReference(
        start,
        rowDelta,
        colDelta,
        bounds,
      );
      const translatedEnd = translateReference(end, rowDelta, colDelta, bounds);
      const startSource = translatedStart
        ? formatReference(translatedStart, start)
        : "#REF!";
      const endSource = translatedEnd
        ? formatReference(translatedEnd, end)
        : "#REF!";
      return `${startSource}:${endSource}`;
    },
  );
}

function rewriteFormulaReferences(
  source: string,
  transformScalarReference: (reference: ParsedReference) => string,
  transformRangeReference: (
    start: ParsedReference,
    end: ParsedReference,
  ) => string,
): string {
  if (!source.startsWith("=")) return source;

  let output = "";
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    if (character === '"') {
      const end = consumeString(source, index);
      output += source.slice(index, end);
      index = end;
      continue;
    }

    const reference = !isIdentifierCharacter(source[index - 1])
      ? parseReference(source.slice(index))
      : null;
    const following = reference ? source[index + reference.length] : undefined;
    if (!reference || isIdentifierCharacter(following) || following === "(") {
      output += character;
      index++;
      continue;
    }

    const rangeStart = index + reference.length;
    const rangeEnd =
      source[rangeStart] === ":"
        ? parseReference(source.slice(rangeStart + 1))
        : null;
    if (
      rangeEnd &&
      !isIdentifierCharacter(source[rangeStart + 1 + rangeEnd.length])
    ) {
      output += transformRangeReference(reference, rangeEnd);
      index = rangeStart + 1 + rangeEnd.length;
      continue;
    }

    output += transformScalarReference(reference);
    index += reference.length;
  }
  return output;
}

function translateReference(
  reference: ParsedReference,
  rowDelta: number,
  colDelta: number,
  bounds: { rows: number; cols: number },
): CellPos | null {
  const row = reference.rowAbsolute
    ? reference.position.row
    : reference.position.row + rowDelta;
  const col = reference.columnAbsolute
    ? reference.position.col
    : reference.position.col + colDelta;
  return row >= 0 && row < bounds.rows && col >= 0 && col < bounds.cols
    ? { row, col }
    : null;
}

function parseReference(source: string): ParsedReference | null {
  const match = REFERENCE_RE.exec(source);
  if (!match) return null;
  const col = colIndex(match[2]);
  const row = Number(match[4]) - 1;
  if (col < 0 || row < 0) return null;
  return {
    position: { row, col },
    columnAbsolute: match[1] === "$",
    rowAbsolute: match[3] === "$",
    length: match[0].length,
  };
}

function transformScalar(
  reference: ParsedReference,
  operation: SheetStructureOperation,
): string {
  const position = transformCellPosition(reference.position, operation);
  return position ? formatReference(position, reference) : "#REF!";
}

function transformRange(
  start: ParsedReference,
  end: ParsedReference,
  operation: SheetStructureOperation,
): string {
  const transformed = transformRangePositions(
    start.position,
    end.position,
    operation,
  );
  if (!transformed) return "#REF!";
  return `${formatReference(transformed.start, start)}:${formatReference(
    transformed.end,
    end,
  )}`;
}

/** Transform a stored sparse cell coordinate; null means deletion removed it. */
export function transformCellPosition(
  position: CellPos,
  operation: SheetStructureOperation,
): CellPos | null {
  const value = operation.axis === "row" ? position.row : position.col;
  const transformed = transformScalarCoordinate(value, operation);
  if (transformed === null) return null;
  return operation.axis === "row"
    ? { row: transformed, col: position.col }
    : { row: position.row, col: transformed };
}

/** Transform one row/column metric index with the document operation contract. */
export function transformAxisMetricIndex(
  index: number,
  operation: SheetStructureOperation,
): number | null {
  return transformScalarCoordinate(index, operation);
}

function transformScalarCoordinate(
  value: number,
  operation: SheetStructureOperation,
): number | null {
  if (operation.kind === "insert")
    return value >= operation.index ? value + operation.count : value;
  const end = operation.index + operation.count;
  if (value >= operation.index && value < end) return null;
  return value >= end ? value - operation.count : value;
}

function transformRangePositions(
  start: CellPos,
  end: CellPos,
  operation: SheetStructureOperation,
): { start: CellPos; end: CellPos } | null {
  if (operation.kind === "insert") {
    const nextStart = transformCellPosition(start, operation);
    const nextEnd = transformCellPosition(end, operation);
    return nextStart && nextEnd ? { start: nextStart, end: nextEnd } : null;
  }

  const startValue = operation.axis === "row" ? start.row : start.col;
  const endValue = operation.axis === "row" ? end.row : end.col;
  const lower = Math.min(startValue, endValue);
  const upper = Math.max(startValue, endValue);
  const deletedEnd = operation.index + operation.count;
  if (lower >= operation.index && upper < deletedEnd) return null;

  const nextLower =
    lower < operation.index ? lower : deletedEnd - operation.count;
  const nextUpper =
    upper >= deletedEnd ? upper - operation.count : operation.index - 1;
  const transformedStartValue = startValue <= endValue ? nextLower : nextUpper;
  const transformedEndValue = startValue <= endValue ? nextUpper : nextLower;

  return operation.axis === "row"
    ? {
        start: { row: transformedStartValue, col: start.col },
        end: { row: transformedEndValue, col: end.col },
      }
    : {
        start: { row: start.row, col: transformedStartValue },
        end: { row: end.row, col: transformedEndValue },
      };
}

function formatReference(
  position: CellPos,
  reference: ParsedReference,
): string {
  return `${reference.columnAbsolute ? "$" : ""}${colName(position.col)}${reference.rowAbsolute ? "$" : ""}${position.row + 1}`;
}

function consumeString(source: string, start: number): number {
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === '"' && source[index + 1] === '"') {
      index += 2;
      continue;
    }
    if (source[index] === '"') return index + 1;
    index++;
  }
  return source.length;
}

function isIdentifierCharacter(value: string | undefined): boolean {
  return value !== undefined && /[A-Za-z0-9_]/.test(value);
}
