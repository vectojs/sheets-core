# Changelog

## 0.4.0

### Minor Changes

- bed3c4f: Add formula-aware dense range capture and transfer primitives plus a compound
  raw-value/format history transaction for fill and internal clipboard workflows.

## Unreleased

### Added

- Stable, sparse range-row sorting by computed values with blanks last,
  formula-reference translation, exact format movement, and compound history
  compatibility.
- Formula-aware dense range capture/tiling with relative, mixed, and absolute
  A1 reference translation for fill and internal clipboard workflows.
- Exact raw-value and format range transactions that undo and redo as one step.

### Fixed

- Keep function identifiers such as `LOG10` out of formula reference rewrites.

## 0.3.1

### Patch Changes

- Coerce case-insensitive `TRUE` and `FALSE` cell literals to boolean values while
  preserving their raw editable text.

## 0.3.0

### Added

- Published the established spreadsheet core under the independent Numera
  product identity and `@vectojs/numera-core` package name.
- Adopted the workspace TypeScript 7 declaration-build baseline.
- Sparse, serializable row and column axis metrics with default sizes and
  validated overrides.
- Undoable axis-size history and structural-operation remapping for resized
  rows and columns.

## 0.2.0

### Added

- Undoable structural row and column insertion/deletion with sparse cell and
  formatting preservation.
- A1-style formula-reference rewriting for structural changes, including ranges,
  absolute markers, and evaluable `#REF!` literals for removed references.

## 0.1.5

### Patch Changes

- Add common numeric, logical, and error-recovery functions: `ABS`, `ROUND`,
  `ROUNDUP`, `ROUNDDOWN`, `AND`, `OR`, `NOT`, and `IFERROR`.

## 0.1.4

### Patch Changes

- Add versioned workbook JSON and RFC 4180-style CSV document exchange helpers.

All notable changes to this project are documented in this file.

## 0.1.3

### Added

- Sparse cell formatting for colors, text emphasis, alignment, and numeric
  presentation, including format-only cells and versioned workbook snapshots.
- Transactional formatting history with undo and redo.

## 0.1.2

### Added

- Ordered `Workbook` document with stable sheet IDs, naming, active-sheet
  selection, creation, renaming, deletion, and versioned sparse JSON snapshots.

## 0.1.1

### Added

- Sparse used-range and in-range populated-cell queries for safe selection,
  clear, cut, and future document automation operations.

## 0.1.0

### Added

- Sparse spreadsheet document with formula dependencies, ranges, errors, and cycle detection.
- Formula parser/evaluator with arithmetic, percent, exponentiation, text concatenation, and common aggregate/logical functions.
- TSV clipboard serialization and transactional undo/redo primitives.
