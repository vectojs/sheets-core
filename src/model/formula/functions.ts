import type { Node } from "./parser";
import {
  evaluate,
  flatten,
  isErr,
  err,
  type EvalContext,
  type Value,
} from "./evaluator";

type Fn = (args: Node[], ctx: EvalContext) => Value;

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
    const truthy =
      typeof cond === "number"
        ? cond !== 0
        : typeof cond === "string"
          ? cond !== ""
          : !!cond;
    if (truthy) return evaluate(args[1], ctx);
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
};

// AVERAGE as the Sheets-canonical alias of AVG.
FUNCTIONS.AVERAGE = FUNCTIONS.AVG;
