import type { Node } from "./parser";
import {
  evaluate,
  flatten,
  isErr,
  err,
  type CellError,
  type EvalContext,
  type Value,
} from "./evaluator";

type Fn = (args: Node[], ctx: EvalContext) => Value;

function scalarNumber(node: Node, ctx: EvalContext): number | CellError {
  const value = evaluate(node, ctx);
  if (isErr(value)) return value;
  if (typeof value === "number") return value;
  if (value === null) return 0;
  if (typeof value === "boolean") return value ? 1 : 0;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? err("#VALUE!") : parsed;
}

function truthy(value: Value): boolean {
  return typeof value === "number"
    ? value !== 0
    : typeof value === "string"
      ? value !== ""
      : !!value;
}

/** Numeric values from flattened args; empty cells and strings are skipped
 *  (Sheets aggregate semantics); errors propagate. */
function numbers(args: Node[], ctx: EvalContext): number[] | Value {
  const out: number[] = [];
  for (const arg of args) {
    for (const v of flatten(arg, ctx)) {
      if (isErr(v)) return v;
      if (typeof v === "number") out.push(v);
    }
  }
  return out;
}

export const FUNCTIONS: Record<string, Fn> = {
  SUM: (args, ctx) => {
    const ns = numbers(args, ctx);
    if (!Array.isArray(ns)) return ns;
    return ns.reduce((a, b) => a + b, 0);
  },
  AVG: (args, ctx) => {
    const ns = numbers(args, ctx);
    if (!Array.isArray(ns)) return ns;
    return ns.length === 0
      ? err("#DIV/0!")
      : ns.reduce((a, b) => a + b, 0) / ns.length;
  },
  MIN: (args, ctx) => {
    const ns = numbers(args, ctx);
    if (!Array.isArray(ns)) return ns;
    return ns.length === 0 ? 0 : Math.min(...ns);
  },
  MAX: (args, ctx) => {
    const ns = numbers(args, ctx);
    if (!Array.isArray(ns)) return ns;
    return ns.length === 0 ? 0 : Math.max(...ns);
  },
  COUNT: (args, ctx) => {
    const ns = numbers(args, ctx);
    if (!Array.isArray(ns)) return ns;
    return ns.length;
  },
  IF: (args, ctx) => {
    if (args.length < 2 || args.length > 3) return err("#ERROR!");
    const cond = evaluate(args[0], ctx);
    if (isErr(cond)) return cond;
    if (truthy(cond)) return evaluate(args[1], ctx);
    return args.length === 3 ? evaluate(args[2], ctx) : false;
  },
  CONCAT: (args, ctx) => {
    let out = "";
    for (const arg of args) {
      for (const v of flatten(arg, ctx)) {
        if (isErr(v)) return v;
        if (v === null) continue;
        out += typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : String(v);
      }
    }
    return out;
  },
  ABS: (args, ctx) => {
    if (args.length !== 1) return err("#ERROR!");
    const value = scalarNumber(args[0], ctx);
    return isErr(value) ? value : Math.abs(value);
  },
  ROUND: (args, ctx) => round(args, ctx, Math.round),
  ROUNDUP: (args, ctx) =>
    round(args, ctx, (value) =>
      value < 0 ? Math.floor(value) : Math.ceil(value),
    ),
  ROUNDDOWN: (args, ctx) =>
    round(args, ctx, (value) =>
      value < 0 ? Math.ceil(value) : Math.floor(value),
    ),
  AND: (args, ctx) => {
    for (const arg of args) {
      const value = evaluate(arg, ctx);
      if (isErr(value)) return value;
      if (!truthy(value)) return false;
    }
    return true;
  },
  OR: (args, ctx) => {
    for (const arg of args) {
      const value = evaluate(arg, ctx);
      if (isErr(value)) return value;
      if (truthy(value)) return true;
    }
    return false;
  },
  NOT: (args, ctx) => {
    if (args.length !== 1) return err("#ERROR!");
    const value = evaluate(args[0], ctx);
    return isErr(value) ? value : !truthy(value);
  },
  IFERROR: (args, ctx) => {
    if (args.length !== 2) return err("#ERROR!");
    const value = evaluate(args[0], ctx);
    return isErr(value) ? evaluate(args[1], ctx) : value;
  },
};

// AVERAGE as the Sheets-canonical alias of AVG.
FUNCTIONS.AVERAGE = FUNCTIONS.AVG;

function round(
  args: Node[],
  ctx: EvalContext,
  operation: (value: number) => number,
): Value {
  if (args.length < 1 || args.length > 2) return err("#ERROR!");
  const value = scalarNumber(args[0], ctx);
  const digits = args.length === 2 ? scalarNumber(args[1], ctx) : 0;
  if (isErr(value)) return value;
  if (isErr(digits)) return digits;
  const factor = 10 ** Math.trunc(digits);
  return operation(value * factor) / factor;
}
