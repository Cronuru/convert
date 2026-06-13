# @cronuru/convert

**Zero-dependency cron expression conversion and validation** across every
major scheduler dialect — Unix, Quartz, Kubernetes, AWS EventBridge, Spring,
and GitHub Actions.

Powers the converter at **[cronuru.com](https://cronuru.com)**.

```bash
npm i @cronuru/convert
```

## Why

The same schedule is written differently on every platform. Day-of-week is
`0–6` (Sun=0) on Unix but `1–7` (Sun=1) on Quartz and EventBridge; Quartz and
EventBridge require the `?` placeholder; some dialects add a seconds or year
field; `L`/`W`/`#` only exist on a few. `@cronuru/convert` normalizes a source
expression and re-emits it in the target dialect's exact shape — and tells you
when a conversion loses precision or hits a platform limit.

No runtime dependencies. ESM + CJS. Typed.

## Usage

```ts
import { convert, convertToAll, validate } from "@cronuru/convert";

convert("0 9 * * 1", "unix", "quartz");
// { ok: true, expression: "0 0 9 ? * 2 *", warnings: [], target: "quartz" }

// Day-of-week is renumbered (Mon: 1 → 2) and day-of-month becomes "?"
// because Quartz requires exactly one of the two day fields to be "?".

convertToAll("*/15 * * * *", "unix");
// { unix, quartz, kubernetes, eventbridge, spring, "github-actions" }
// each → { ok, expression, warnings, target }

validate("0 9 1 * 1", "unix");
// { ok: true, findings: [{ severity: "warning",
//   title: "Day-of-month AND day-of-week both set", ... }], fieldCount: 5 }
```

Conversions surface non-fatal `warnings` (precision loss, the DOM/DOW OR-trap,
GitHub Actions' 5-minute floor, unsupported special characters), and `ok` is
`false` only when the source can't be parsed at all.

## CLI

```bash
npx @cronuru/convert "0 9 * * 1" --from unix --to quartz
# 0 0 9 ? * 2 *

npx @cronuru/convert "*/15 * * * *" --from unix --to all
# unix            */15 * * * *
# quartz          0 */15 * * * ? *
# kubernetes      */15 * * * *
# eventbridge     */15 * * * ? *
# spring          0 */15 * * * *
# github-actions  */15 * * * *
```

## API

| Export | Signature |
|---|---|
| `convert` | `(expr, from, to) => ConversionResult` |
| `convertToAll` | `(expr, from) => Record<DialectSlug, ConversionResult>` |
| `validate` | `(expr, dialect) => ValidationResult` |
| `DIALECTS` / `DIALECT_LIST` / `getDialect` | dialect metadata |

`DialectSlug` is one of: `unix`, `quartz`, `kubernetes`, `eventbridge`,
`spring`, `github-actions`.

## Dialects

| Dialect | Fields | Seconds | Year | Day-of-week | `?` |
|---|---|---|---|---|---|
| Unix cron | 5 | – | – | 0–6 (Sun=0) | – |
| Quartz | 6–7 | ✓ | ✓ | 1–7 (Sun=1) | required |
| Kubernetes | 5 | – | – | 0–6 (Sun=0) | – |
| AWS EventBridge | 6 | – | ✓ | 1–7 (Sun=1) | required |
| Spring `@Scheduled` | 6 | ✓ | – | 0–7 | – |
| GitHub Actions | 5 | – | – | 0–6 (Sun=0) | – |

See the full per-dialect references at
[cronuru.com/dialects](https://cronuru.com/dialects).

## License

MIT © [Cronuru](https://cronuru.com)
