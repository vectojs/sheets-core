# @vectojs/numera-core

> Pure spreadsheet document primitives for the Numera family.

[![MIT license](https://img.shields.io/badge/license-MIT-6366f1.svg)](./LICENSE)

`@vectojs/numera-core` owns spreadsheet state, cell formatting, formula evaluation, clipboard
serialization, workbook snapshots, and transactional history. It intentionally has no VectoJS,
Canvas, DOM, browser, or MCP dependency, so a website, CLI, skill, or MCP tool
can operate on the same document semantics.

It also provides undoable structural row and column insertion/deletion. Structural
operations rebuild the sparse document while preserving cell formats and rewrite
A1-style formula references (including ranges and absolute markers) so every
consumer shares one predictable spreadsheet contract.

Sheet-level row and column metrics use sparse overrides: default-sized axes
remain implicit, while resized axes survive snapshots, structural transforms,
and transactional undo/redo for use by any rendering or automation adapter.

Range transfer is also a Core document operation. `captureRange()` records a
logically dense but sparsely stored value/format payload, `transferRange()` tiles it while translating
relative A1 references, and `SheetHistory.applyCellStates()` commits exact raw
values and formats as one undoable transaction. Canvas fill handles, internal
clipboard actions, CLI, and MCP consumers can therefore share one spreadsheet
contract without importing rendering or browser state.

`sortRange()` produces sparse exact-state writes for a complete selected row
range, orders by computed values with stable ties and blanks last, moves exact
formats, and translates formulas by their source-to-destination row delta. The
result can be committed through `SheetHistory.applyCellStates()` as one undoable
operation by Website, CLI, or MCP adapters.

## Supported formulas

The evaluator supports arithmetic, references, ranges, percent, exponentiation,
and text concatenation. Built-in functions include `SUM`, `AVG`/`AVERAGE`,
`MIN`, `MAX`, `COUNT`, `IF`, `CONCAT`, `ABS`, `ROUND`, `ROUNDUP`,
`ROUNDDOWN`, `AND`, `OR`, `NOT`, and `IFERROR`.

## Install

```bash
bun add @vectojs/numera-core
```

## Use

```ts
import { SheetHistory, SheetModel } from "@vectojs/numera-core";

const sheet = new SheetModel();
const history = new SheetHistory(sheet);
history.apply([{ row: 0, col: 0, raw: "2" }]);
history.apply([{ row: 0, col: 1, raw: "=A1*3" }]);
history.applyStructure({ kind: "insert", axis: "row", index: 0, count: 1 });

sheet.getDisplay(1, 1); // "6", because the formula moved with its row
```

## Verify

```bash
bun install
bun run format:check
bun run lint
bun test
bun run build
```

## Release governance

Public API changes start with a Changeset, then the reviewed version bump is
published through the repository's exact `@vectojs/numera-core@<version>` tag
workflow. `CHANGELOG.md` remains the human-readable release record.

## License

[MIT](./LICENSE) © 2026 Xuepoo
