# Changelog

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
