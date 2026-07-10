# @vectojs/sheets-core

> Pure spreadsheet document primitives for the VectoJS Sheets family.

[![MIT license](https://img.shields.io/badge/license-MIT-6366f1.svg)](./LICENSE)

`@vectojs/sheets-core` owns spreadsheet state, formula evaluation, clipboard
serialization, and transactional history. It intentionally has no VectoJS,
Canvas, DOM, browser, or MCP dependency, so a website, CLI, skill, or MCP tool
can operate on the same document semantics.

## Install

```bash
bun add @vectojs/sheets-core
```

## Use

```ts
import { SheetHistory, SheetModel } from "@vectojs/sheets-core";

const sheet = new SheetModel();
const history = new SheetHistory(sheet);
history.apply([{ row: 0, col: 0, raw: "2" }]);
history.apply([{ row: 0, col: 1, raw: "=A1*3" }]);

sheet.getDisplay(0, 1); // "6"
```

## Verify

```bash
bun install
bun run format:check
bun run lint
bun test
bun run build
```

## License

[MIT](./LICENSE) © 2026 Xuepoo
