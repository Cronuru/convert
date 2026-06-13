// Metadata for each cron dialect supported in v1.
// Used by the converter, parser dropdown, dialect reference pages, and per-pattern code snippets.

export type DialectSlug =
  | "unix"
  | "quartz"
  | "kubernetes"
  | "eventbridge"
  | "spring"
  | "github-actions";

export interface DialectMeta {
  slug: DialectSlug;
  name: string;
  fieldCount: 5 | 6 | 7;
  hasSeconds: boolean;
  hasYear: boolean;
  /** Field order, left to right. */
  fields: ReadonlyArray<"second" | "minute" | "hour" | "dom" | "month" | "dow" | "year">;
  /** Day-of-week range: 0–6 (Sun=0, Sat=6) for Unix; 1–7 (Sun=1, Sat=7) for Quartz/EventBridge/Spring. */
  dowRange: [number, number];
  /** Whether DOM and DOW use the OR-of-both-set vs ?-placeholder convention. */
  domDowConvention: "or" | "question-mark";
  /** Special characters supported beyond `*`, `,`, `-`, `/`. */
  specialChars: string[];
  /** Quick description for tooltips and dialect cards. */
  blurb: string;
}

export const DIALECTS: Record<DialectSlug, DialectMeta> = {
  unix: {
    slug: "unix",
    name: "Unix cron",
    fieldCount: 5,
    hasSeconds: false,
    hasYear: false,
    fields: ["minute", "hour", "dom", "month", "dow"],
    dowRange: [0, 6],
    domDowConvention: "or",
    specialChars: [],
    blurb: "Standard 5-field cron used by crontab, GitHub Actions, and most CI/CD platforms.",
  },
  quartz: {
    slug: "quartz",
    name: "Quartz Scheduler",
    fieldCount: 7,
    hasSeconds: true,
    hasYear: true,
    fields: ["second", "minute", "hour", "dom", "month", "dow", "year"],
    dowRange: [1, 7],
    domDowConvention: "question-mark",
    specialChars: ["?", "L", "W", "#"],
    blurb: "Java's Quartz Scheduler — 6 or 7 fields, seconds-precision, Sunday=1.",
  },
  kubernetes: {
    slug: "kubernetes",
    name: "Kubernetes CronJob",
    fieldCount: 5,
    hasSeconds: false,
    hasYear: false,
    fields: ["minute", "hour", "dom", "month", "dow"],
    dowRange: [0, 6],
    domDowConvention: "or",
    specialChars: ["@hourly", "@daily", "@weekly", "@monthly", "@yearly"],
    blurb: "Kubernetes CronJob spec.schedule — standard 5-field, UTC by default.",
  },
  eventbridge: {
    slug: "eventbridge",
    name: "AWS EventBridge",
    fieldCount: 6,
    hasSeconds: false,
    hasYear: true,
    fields: ["minute", "hour", "dom", "month", "dow", "year"],
    dowRange: [1, 7],
    domDowConvention: "question-mark",
    specialChars: ["?", "L", "W", "#"],
    blurb: "AWS EventBridge / CloudWatch Events — 6 fields including year, Sunday=1, UTC only.",
  },
  spring: {
    slug: "spring",
    name: "Spring @Scheduled",
    fieldCount: 6,
    hasSeconds: true,
    hasYear: false,
    fields: ["second", "minute", "hour", "dom", "month", "dow"],
    dowRange: [0, 7],
    domDowConvention: "or",
    specialChars: ["L"],
    blurb: "Spring Framework — 6-field with seconds, Sunday=0 or 7, supports L for last day.",
  },
  "github-actions": {
    slug: "github-actions",
    name: "GitHub Actions",
    fieldCount: 5,
    hasSeconds: false,
    hasYear: false,
    fields: ["minute", "hour", "dom", "month", "dow"],
    dowRange: [0, 6],
    domDowConvention: "or",
    specialChars: [],
    blurb: "GitHub Actions `on.schedule.cron` — standard 5-field Unix, UTC, minimum 5-minute granularity.",
  },
};

export const DIALECT_LIST: ReadonlyArray<DialectMeta> = Object.values(DIALECTS);

export function getDialect(slug: DialectSlug): DialectMeta {
  return DIALECTS[slug];
}
