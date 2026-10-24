import { spawn } from "node:child_process";

/**
 * Spawn `npx <args>`; inherits stdio unless `capture` is set.
 * Secrets must go through `input` (stdin), never args.
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ input?: string, capture?: boolean }} [opts]
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
export function run(cmd, args, { input, capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: capture ? ["pipe", "pipe", "pipe"] : [input === undefined ? "inherit" : "pipe", "inherit", "inherit"],
      shell: process.platform === "win32",
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => (stdout += d));
    child.stderr?.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    if (child.stdin) {
      if (input !== undefined) child.stdin.write(input);
      child.stdin.end();
    }
  });
}
