import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workerDir = fileURLToPath(new URL("../../worker/", import.meta.url));

function workerSources(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "test") continue;
      out.push(...workerSources(full));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

const NODE_IMPORT = /(?:from\s*|require\s*\(\s*|import\s*\(\s*)["']node:/;

describe("worker source", () => {
  const files = workerSources(workerDir);

  it("finds the worker sources", () => {
    expect(files.map((f) => relative(workerDir, f))).toContain("index.ts");
  });

  for (const file of files) {
    it(`${relative(workerDir, file)} has no node: imports`, () => {
      expect(readFileSync(file, "utf8")).not.toMatch(NODE_IMPORT);
    });
  }
});
