// Cron expression validator / linter. Goes beyond "does it parse" to surface
// the issues that actually bite in production: the DOM/DOW OR-trap, dialect-
// specific syntax requirements (? placeholder, unsupported L/W/#), platform
// minimums (GitHub Actions 5-minute floor), DST-window scheduling, and
// out-of-range values. Pure functions, usable from the React island.

import { DIALECTS } from "./dialects";
import type { DialectSlug } from "./dialects";

export type Severity = "error" | "warning" | "info";

export interface Finding {
  severity: Severity;
  title: string;
  detail: string;
}

export interface ValidationResult {
  /** False when at least one error-severity finding is present. */
  ok: boolean;
  findings: Finding[];
  fieldCount: number;
}

const FIELD_LABEL: Record<string, string> = {
  second: "second",
  minute: "minute",
  hour: "hour",
  dom: "day-of-month",
  month: "month",
  dow: "day-of-week",
  year: "year",
};

const KNOWN_SHORTCUTS = [
  "@yearly",
  "@annually",
  "@monthly",
  "@weekly",
  "@daily",
  "@midnight",
  "@hourly",
  "@reboot",
];

/** Check the numeric tokens in a field against an inclusive [min, max] range. */
function checkFieldRange(field: string, label: string, min: number, max: number): Finding | null {
  if (field === "*" || field === "?") return null;
  for (const part of field.split(",")) {
    const [rangePart] = part.split("/"); // strip the step divisor
    if (rangePart === "*" || rangePart === "") continue;
    for (const bound of rangePart.split("-")) {
      if (!/^\d+$/.test(bound)) continue; // skip names (JAN, MON), L, W, # forms
      const n = parseInt(bound, 10);
      if (n < min || n > max) {
        return {
          severity: "error",
          title: `${label} out of range`,
          detail: `"${bound}" is outside the valid ${label} range (${min}–${max}).`,
        };
      }
    }
  }
  return null;
}

function validateShortcut(s: string, dialect: DialectSlug): ValidationResult {
  const meta = DIALECTS[dialect];
  const findings: Finding[] = [];

  if (!KNOWN_SHORTCUTS.includes(s)) {
    findings.push({
      severity: "error",
      title: "Unknown shortcut",
      detail: `"${s}" isn't a recognized cron shortcut. Valid ones: @yearly, @monthly, @weekly, @daily, @hourly, @reboot.`,
    });
    return { ok: false, findings, fieldCount: 0 };
  }

  // Schedulers that don't support @-shortcuts at all.
  if (dialect === "github-actions" || dialect === "eventbridge" || dialect === "quartz") {
    findings.push({
      severity: "error",
      title: "Shortcuts not supported",
      detail: `${meta.name} doesn't support "@" shortcuts like ${s}. Write the full expression instead.`,
    });
    return { ok: false, findings, fieldCount: 0 };
  }

  if (s === "@reboot") {
    if (dialect === "unix") {
      findings.push({
        severity: "info",
        title: "Runs once at startup",
        detail: "@reboot runs the job once when the cron daemon starts (Linux crontab only).",
      });
      return { ok: true, findings, fieldCount: 0 };
    }
    findings.push({
      severity: "error",
      title: "@reboot not supported",
      detail: `${meta.name} has no notion of system boot, so @reboot won't work here.`,
    });
    return { ok: false, findings, fieldCount: 0 };
  }

  findings.push({
    severity: "info",
    title: "Valid shortcut",
    detail: `${s} is recognized by ${meta.name}.`,
  });
  return { ok: true, findings, fieldCount: 0 };
}

export function validate(expression: string, dialect: DialectSlug): ValidationResult {
  const meta = DIALECTS[dialect];
  const trimmed = expression.trim();

  if (!trimmed) {
    return {
      ok: false,
      findings: [{ severity: "error", title: "Empty expression", detail: "Enter a cron expression to validate." }],
      fieldCount: 0,
    };
  }

  if (trimmed.startsWith("@")) {
    return validateShortcut(trimmed, dialect);
  }

  const findings: Finding[] = [];
  const parts = trimmed.split(/\s+/);
  const accepted = dialect === "quartz" ? [6, 7] : [meta.fieldCount];

  if (!accepted.includes(parts.length)) {
    findings.push({
      severity: "error",
      title: "Wrong number of fields",
      detail: `${meta.name} expects ${accepted.join(" or ")} fields (${meta.fields.join(", ")}); got ${parts.length}.`,
    });
    return { ok: false, findings, fieldCount: parts.length };
  }

  // Map each position to its semantic field name.
  const fieldNames =
    dialect === "quartz" && parts.length === 6
      ? (["second", "minute", "hour", "dom", "month", "dow"] as const)
      : meta.fields;
  const fieldMap: Record<string, string> = {};
  fieldNames.forEach((n, i) => {
    fieldMap[n] = parts[i];
  });

  // Charset + range checks per field.
  const ranges: Record<string, [number, number]> = {
    second: [0, 59],
    minute: [0, 59],
    hour: [0, 23],
    dom: [1, 31],
    month: [1, 12],
    dow: meta.dowRange,
    year: dialect === "eventbridge" ? [1970, 2199] : [1970, 2099],
  };
  for (const [name, val] of Object.entries(fieldMap)) {
    if (!/^[*?,/\-LW#0-9A-Za-z]+$/.test(val)) {
      findings.push({
        severity: "error",
        title: `Invalid characters in ${FIELD_LABEL[name] ?? name}`,
        detail: `"${val}" contains characters cron doesn't recognize.`,
      });
      continue;
    }
    const r = ranges[name];
    if (r) {
      const f = checkFieldRange(val, FIELD_LABEL[name] ?? name, r[0], r[1]);
      if (f) findings.push(f);
    }
  }

  const dom = fieldMap.dom ?? "*";
  const dow = fieldMap.dow ?? "*";

  // ? placeholder rules.
  if (meta.domDowConvention === "question-mark") {
    const domQ = dom === "?";
    const dowQ = dow === "?";
    if (!domQ && !dowQ) {
      findings.push({
        severity: "error",
        title: "Missing ? placeholder",
        detail: `${meta.name} requires exactly one of day-of-month or day-of-week to be "?". Set whichever field you aren't using to "?".`,
      });
    } else if (domQ && dowQ) {
      findings.push({
        severity: "error",
        title: "Both day fields are ?",
        detail: `Set exactly one of day-of-month / day-of-week to "?" — the other must specify the day.`,
      });
    }
  } else {
    if (dom === "?" || dow === "?") {
      findings.push({
        severity: "error",
        title: `"?" not supported`,
        detail: `${meta.name} doesn't recognize "?". Use "*" instead, or switch to Quartz / AWS EventBridge.`,
      });
    }
    // The classic DOM/DOW OR-trap.
    if (dom !== "*" && dow !== "*") {
      findings.push({
        severity: "warning",
        title: "Day-of-month AND day-of-week both set",
        detail: `In ${meta.name}, the job runs on days matching EITHER field, not both — "${dom}" (day-of-month) OR "${dow}" (day-of-week). This usually fires more often than intended.`,
      });
    }
  }

  // Special-character support.
  const hasL = (dom + dow).includes("L");
  const hasW = dom.includes("W");
  const hasHash = dow.includes("#");
  if (hasL || hasW || hasHash) {
    if (dialect === "unix" || dialect === "kubernetes" || dialect === "github-actions") {
      const chars = [hasL && "L", hasW && "W", hasHash && "#"].filter(Boolean).join(", ");
      findings.push({
        severity: "error",
        title: `"${chars}" not supported`,
        detail: `${meta.name} doesn't support the ${chars} special character${chars.length > 1 ? "s" : ""} — these are Quartz / EventBridge extensions.`,
      });
    } else if (dialect === "spring" && (hasW || hasHash)) {
      const chars = [hasW && "W", hasHash && "#"].filter(Boolean).join(", ");
      findings.push({
        severity: "error",
        title: `"${chars}" not supported in Spring`,
        detail: `Spring @Scheduled supports "L" in day-of-month but not ${chars}.`,
      });
    }
  }

  // GitHub Actions 5-minute minimum.
  if (dialect === "github-actions") {
    const minute = fieldMap.minute ?? "*";
    if (minute === "*" || /^\*\/[1-4]$/.test(minute)) {
      findings.push({
        severity: "warning",
        title: "Below GitHub Actions' 5-minute minimum",
        detail: `GitHub Actions enforces a 5-minute minimum interval. "${minute}" in the minute field may not trigger — the fastest valid schedule is "*/5 * * * *".`,
      });
    }
  }

  // Every-minute overlap heads-up.
  const minute = fieldMap.minute ?? "*";
  if (minute === "*") {
    findings.push({
      severity: "info",
      title: "Fires every minute",
      detail: `This runs roughly 1,440 times per day. If a run can take longer than a minute, guard against overlap (flock, or concurrencyPolicy: Forbid on Kubernetes).`,
    });
  }

  // DST-window scheduling.
  const hour = fieldMap.hour ?? "*";
  if ((hour === "2" || hour === "3") && minute !== "*") {
    findings.push({
      severity: "info",
      title: "Scheduled during a DST transition window",
      detail: `Jobs at 2–3 AM local time can be skipped on spring-forward day or run twice on fall-back day. Pin the timezone to UTC if predictable timing matters.`,
    });
  }

  const hasError = findings.some((f) => f.severity === "error");
  return { ok: !hasError, findings, fieldCount: parts.length };
}
