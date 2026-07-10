<!-- Conventional Commit title, for example: feat(formula): add lookup functions -->

## What and why

<!-- Describe the document-model problem and link the issue: Closes #123. -->

## Changes

-

## Public API and document compatibility

<!-- Describe exports, snapshot/codec compatibility, formula semantics, and migration impact. -->

## Verification

- [ ] `bun run format:check`
- [ ] `bun run lint`
- [ ] `bun test`
- [ ] `bun run build`
- [ ] `npm pack --dry-run`

## Checklist

- [ ] Added a Changeset for a public package/API/behavior change.
- [ ] Updated `README.md` and `CHANGELOG.md` when behavior or responsibilities changed.
- [ ] Added deterministic tests for document, formula, history, or codec semantics.
- [ ] Kept the package independent from VectoJS, DOM, browser, CLI, and MCP layers.
- [ ] Wrote documentation and non-obvious code comments in English.
