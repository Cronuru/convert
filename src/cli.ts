import { convert, convertToAll, DIALECTS } from "./index";
import type { DialectSlug } from "./index";

const SLUGS = Object.keys(DIALECTS) as DialectSlug[];

function out(s: string) { process.stdout.write(s + "\n"); }
function err(s: string) { process.stderr.write(s + "\n"); }
function die(msg: string): never { err("error: " + msg); process.exit(2); }

const HELP = `cron-convert — convert a cron expression between dialects

Usage:
  cron-convert "<expression>" --from <dialect> --to <dialect|all>

Dialects: ${SLUGS.join(", ")}

Examples:
  cron-convert "0 9 * * 1" --from unix --to quartz
  cron-convert "0 0 9 ? * 2 *" --from quartz --to unix
  cron-convert "*/15 * * * *" --from unix --to all

Options:
  -f, --from   source dialect (default: unix)
  -t, --to     target dialect, or "all"
  -h, --help   show this help`;

const argv = process.argv.slice(2);
if (argv.length === 0 || argv.includes("-h") || argv.includes("--help")) {
  out(HELP);
  process.exit(0);
}

let expression = "";
let from = "unix";
let to = "";
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--from" || a === "-f") from = argv[++i] ?? "";
  else if (a === "--to" || a === "-t") to = argv[++i] ?? "";
  else if (!a.startsWith("-")) expression = a;
  else die(`unknown option: ${a}`);
}

if (!expression) die("no expression given (see --help)");
if (!SLUGS.includes(from as DialectSlug)) die(`unknown --from dialect: ${from}`);
if (to !== "all" && !SLUGS.includes(to as DialectSlug)) die(`unknown --to dialect: ${to || "(missing)"}`);

if (to === "all") {
  const all = convertToAll(expression, from as DialectSlug);
  const width = Math.max(...SLUGS.map((s) => s.length));
  for (const slug of SLUGS) {
    const r = all[slug];
    out(`${slug.padEnd(width)}  ${r.ok ? r.expression : "(" + r.warnings[0] + ")"}`);
  }
  process.exit(0);
}

const r = convert(expression, from as DialectSlug, to as DialectSlug);
out(r.expression);
for (const w of r.warnings) err("warning: " + w);
process.exit(r.ok ? 0 : 1);
