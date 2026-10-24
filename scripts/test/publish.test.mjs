import { describe, expect, it } from "vitest";
import { shouldSkipConfirm } from "../publish.mjs";

describe("shouldSkipConfirm", () => {
  it("is false without --yes and with CI unset, false or 0", () => {
    expect(shouldSkipConfirm([], {})).toBe(false);
    expect(shouldSkipConfirm([], { CI: undefined })).toBe(false);
    expect(shouldSkipConfirm([], { CI: "false" })).toBe(false);
    expect(shouldSkipConfirm([], { CI: "0" })).toBe(false);
    expect(shouldSkipConfirm([], { CI: "" })).toBe(false);
    expect(shouldSkipConfirm([], { CI: "1" })).toBe(false);
    expect(shouldSkipConfirm(["--yesplease"], {})).toBe(false);
  });

  it("is true with --yes or CI=true", () => {
    expect(shouldSkipConfirm(["--yes"], {})).toBe(true);
    expect(shouldSkipConfirm(["--yes"], { CI: "false" })).toBe(true);
    expect(shouldSkipConfirm([], { CI: "true" })).toBe(true);
  });
});
