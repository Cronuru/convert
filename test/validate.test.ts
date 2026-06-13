import { describe, it, expect } from "vitest";
import { validate } from "../src/index";

describe("validate", () => {
  it("accepts a valid unix expression", () => {
    expect(validate("0 9 * * 1", "unix").ok).toBe(true);
  });

  it("errors on out-of-range values", () => {
    const r = validate("99 9 * * 1", "unix");
    expect(r.ok).toBe(false);
    expect(r.findings.some((f) => f.severity === "error")).toBe(true);
  });

  it("warns about the DOM/DOW OR-trap without failing", () => {
    const r = validate("0 9 1 * 1", "unix");
    expect(r.ok).toBe(true);
    expect(r.findings.some((f) => /both set/i.test(f.title))).toBe(true);
  });

  it("requires a ? placeholder in quartz", () => {
    const r = validate("0 0 9 * * 2 *", "quartz");
    expect(r.ok).toBe(false);
  });

  it("flags unsupported L/W/# in unix", () => {
    const r = validate("0 9 L * *", "unix");
    expect(r.ok).toBe(false);
  });
});
