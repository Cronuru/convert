// Cross-dialect cron conversion.
// Normalizes a source expression into a field record, then re-emits it in the target
// dialect's shape — handling DoW renumbering (Sun=0 vs Sun=1), the Quartz/EventBridge
// `?` placeholder convention, and warning when target lacks features the source uses
// (seconds, year, L/W/# special characters).

import { DIALECTS } from "./dialects";
import type { DialectSlug, DialectMeta } from "./dialects";

export interface ConversionResult {
  /** The expression in the target dialect's syntax. */
  expression: string;
  /** Non-fatal warnings about precision loss or unsupported features. */
  warnings: string[];
  /** False when source expression can't be parsed at all. */
  ok: boolean;
  /** Original target metadata for downstream rendering. */
  target: DialectSlug;
}

type FieldKey = "second" | "minute" | "hour" | "dom" | "month" | "dow" | "year";

type Normalized = Partial<Record<FieldKey, string>>;

function isUnixDowFamily(d: DialectSlug): boolean {
  // Unix convention: Sun=0. Spring accepts both 0 and 7 — treat it as Unix-family.
  return d === "unix" || d === "kubernetes" || d === "github-actions" || d === "spring";
}

function isQuartzDowFamily(d: DialectSlug): boolean {
  // Quartz convention: Sun=1, Sat=7.
  return d === "quartz" || d === "eventbridge";
}

function usesQuestionMark(d: DialectSlug): boolean {
  return d === "quartz" || d === "eventbridge";
}

/** Renumber DoW values when crossing family boundaries (0-6 ↔ 1-7). */
function convertDowValue(val: string, from: DialectSlug, to: DialectSlug): string {
  if (val === "*" || val === "?" || val === "") return val;
  if (isUnixDowFamily(from) === isUnixDowFamily(to)) return val;

  // Names like MON, TUE, etc. pass through.
  if (/[A-Za-z]/.test(val)) return val;

  const goingToQuartz = isQuartzDowFamily(to);
  return val.replace(/\d+/g, (n) => {
    let num = parseInt(n, 10);
    num = goingToQuartz ? num + 1 : num - 1;
    if (goingToQuartz && num === 0) num = 7;
    if (!goingToQuartz && num === 7) num = 0;
    return String(num);
  });
}

function detectSpecialChars(norm: Normalized): { hasL: boolean; hasW: boolean; hasHash: boolean } {
  const dom = norm.dom ?? "";
  const dow = norm.dow ?? "";
  return {
    hasL: dom.includes("L") || dow.includes("L"),
    hasW: dom.includes("W"),
    hasHash: dow.includes("#"),
  };
}

export function convert(expression: string, from: DialectSlug, to: DialectSlug): ConversionResult {
  const warnings: string[] = [];
  const srcMeta: DialectMeta = DIALECTS[from];
  const tgtMeta: DialectMeta = DIALECTS[to];
  const trimmed = expression.trim();

  if (!trimmed) {
    return { expression: "", warnings, ok: false, target: to };
  }

  const parts = trimmed.split(/\s+/);
  // Quartz accepts 6 OR 7 fields (year is optional).
  const acceptedCounts =
    from === "quartz" ? [6, 7] : [srcMeta.fieldCount];

  if (!acceptedCounts.includes(parts.length)) {
    return {
      expression: trimmed,
      warnings: [`Source has ${parts.length} fields; ${srcMeta.name} expects ${acceptedCounts.join(" or ")}.`],
      ok: false,
      target: to,
    };
  }

  // Normalize: map parts to field-keyed record using source dialect's field order.
  const norm: Normalized = {};
  const srcFields =
    from === "quartz" && parts.length === 6
      ? ["second", "minute", "hour", "dom", "month", "dow"]
      : srcMeta.fields;
  for (let i = 0; i < parts.length; i++) {
    norm[srcFields[i] as FieldKey] = parts[i];
  }

  // Fill defaults so target rendering can pick any field.
  if (norm.second === undefined) norm.second = "0";
  if (norm.year === undefined) norm.year = "*";
  if (norm.dom === undefined) norm.dom = "*";
  if (norm.dow === undefined) norm.dow = "*";

  // DoW family conversion.
  norm.dow = convertDowValue(norm.dow, from, to);

  // ? placeholder logic for target.
  if (usesQuestionMark(to)) {
    const domSpecific = norm.dom !== "*" && norm.dom !== "?";
    const dowSpecific = norm.dow !== "*" && norm.dow !== "?";
    if (domSpecific && dowSpecific) {
      warnings.push(
        `${tgtMeta.name} requires exactly one of day-of-month and day-of-week to be \`?\`. Source has both set, which is the Unix OR-trap pattern — setting day-of-month to \`?\` so day-of-week takes precedence. Verify this matches your intent.`
      );
      norm.dom = "?";
    } else if (!domSpecific && !dowSpecific) {
      // Both wildcards — pick DoW as the ? by convention.
      norm.dow = "?";
    } else if (!domSpecific) {
      norm.dom = "?";
    } else {
      norm.dow = "?";
    }
  } else {
    // Target doesn't use ? — convert any source ? back to *.
    if (norm.dom === "?") norm.dom = "*";
    if (norm.dow === "?") norm.dow = "*";
  }

  // Unsupported-feature warnings.
  const specials = detectSpecialChars(norm);
  const targetSupportsSpecials = ["quartz", "eventbridge", "spring"].includes(to);
  if ((specials.hasL || specials.hasW || specials.hasHash) && !targetSupportsSpecials) {
    const chars = [
      specials.hasL ? "L" : null,
      specials.hasW ? "W" : null,
      specials.hasHash ? "#" : null,
    ]
      .filter(Boolean)
      .join(", ");
    warnings.push(
      `${tgtMeta.name} does not support the ${chars} special character${chars.length > 1 ? "s" : ""}. The expression will not parse on this platform — see workarounds in the dialect reference.`
    );
  }
  if (specials.hasW && to === "spring") {
    warnings.push("Spring supports `L` in day-of-month but not `W`.");
  }

  // Seconds-loss warning.
  if (srcMeta.hasSeconds && !tgtMeta.hasSeconds && norm.second && norm.second !== "0") {
    warnings.push(
      `${tgtMeta.name} doesn't support sub-minute precision — the source's seconds field \`${norm.second}\` was dropped.`
    );
  }

  // Year-loss warning.
  if (srcMeta.hasYear && !tgtMeta.hasYear && norm.year && norm.year !== "*") {
    warnings.push(
      `${tgtMeta.name} doesn't support a year field — the source's year \`${norm.year}\` was dropped.`
    );
  }

  // GH Actions 5-minute minimum heads-up.
  if (to === "github-actions" && /^\*$|^\*\/[1234]$/.test(norm.minute ?? "")) {
    warnings.push(
      "GitHub Actions enforces a 5-minute minimum schedule interval. This expression may be rejected or silently not run."
    );
  }

  // Emit in target's field order.
  const targetExpression = tgtMeta.fields.map((f) => norm[f as FieldKey] ?? "*").join(" ");

  return {
    expression: targetExpression,
    warnings,
    ok: true,
    target: to,
  };
}

export function convertToAll(
  expression: string,
  from: DialectSlug
): Record<DialectSlug, ConversionResult> {
  const result = {} as Record<DialectSlug, ConversionResult>;
  for (const slug of Object.keys(DIALECTS) as DialectSlug[]) {
    result[slug] = convert(expression, from, slug);
  }
  return result;
}
