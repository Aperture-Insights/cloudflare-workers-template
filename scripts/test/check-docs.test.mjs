import { describe, expect, it } from "vitest";
import { findMissingScripts } from "../check-docs.mjs";

describe("findMissingScripts", () => {
  it("returns script names mentioned in the docs but missing from package.json", () => {
    expect(findMissingScripts(["run `npm run build` and npm run nope"], { build: "x" })).toEqual(["nope"]);
  });

  it("returns [] when every mentioned script exists", () => {
    expect(findMissingScripts(["npm run build", "npm run publish:staging"], { build: "x", "publish:staging": "y" })).toEqual([]);
  });

  it("de-duplicates across texts", () => {
    expect(findMissingScripts(["npm run nope", "npm run nope and npm run other"], {})).toEqual(["nope", "other"]);
  });
});
