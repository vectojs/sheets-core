# Sheets Core Context

## Ubiquitous language

- **Workbook document:** the sparse, rectangular spreadsheet state represented
  by a `SheetModel`. The current model is one sheet; a future workbook may own
  multiple sheet documents.
- **Cell raw value:** user-editable text, including a formula beginning with
  `=`. It is distinct from a resolved display value.
- **Populated cell:** a cell with a non-empty raw value and therefore an entry
  in the sparse model map.
- **Used range:** the smallest normalized rectangle containing every populated
  cell; it is `null` for an empty document.
- **Selection anchor:** the stable cell where a range gesture began.
- **Selection active end:** the current cell of a keyboard or pointer gesture.
  The normalized selection range is derived from anchor and active end.
- **Document operation:** a serializable, transactional collection of cell
  writes. UI, CLI, and MCP surfaces submit operations; none alter dependencies
  or renderer state directly.
