import { describe, it, expect } from "vitest";
import { convert, convertToAll, DIALECTS } from "../src/index";

describe("convert", () => {
  it("unix -> quartz adds seconds/year and applies the ? placeholder", () => {
    const r = convert("0 9 * * 1", "unix", "quartz");
    expect(r.ok).toBe(true);
    // minute0 hour9, dow Mon: unix 1 -> quartz 2, dom becomes ? since dow is set
    expect(r.expression).toBe("0 0 9 ? * 2 *");
  });

  it("quartz -> unix is the inverse (drops seconds/year, renumbers dow)", () => {
    const r = convert("0 0 9 ? * 2 *", "quartz", "unix");
    expect(r.ok).toBe(true);
    expect(r.expression).toBe("0 9 * * 1");
  });

  it("renumbers day-of-week across the 0-6 / 1-7 family boundary", () => {
    // Sunday: unix 0 -> eventbridge 1
    const r = convert("30 8 * * 0", "unix", "eventbridge");
    expect(r.expression.split(" ")[4]).toBe("1");
  });

  it("warns when seconds precision is lost", () => {
    const r = convert("30 0 9 * * *", "spring", "unix");
    expect(r.ok).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/seconds/i);
  });

  it("flags the DOM+DOW OR-trap when targeting a ?-convention dialect", () => {
    const r = convert("0 9 1 * 1", "unix", "quartz");
    expect(r.warnings.join(" ")).toMatch(/day-of-month/i);
  });

  it("rejects an expression with the wrong field count", () => {
    const r = convert("0 9 * *", "unix", "quartz");
    expect(r.ok).toBe(false);
  });

  it("convertToAll returns every dialect", () => {
    const all = convertToAll("*/15 * * * *", "unix");
    expect(Object.keys(all).sort()).toEqual(Object.keys(DIALECTS).sort());
    expect(all.kubernetes.ok).toBe(true);
  });
});
