#!/usr/bin/env node
// studio.mjs — Motion Studio moved to its own repository (abm-dungtq/motion-studio). This shim
// keeps the old command working: it finds Studio at $MOTION_STUDIO_HOME, else ~/Projects/motion-studio,
// and runs its bin/motion-studio.mjs with the same arguments and exit code.
//   node studio.mjs start [--background] [--root <dir>] | status | stop | --help
// No Studio found: prints the clone command and exits 2.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export function findStudio(env = process.env) {
  const dirs = [env.MOTION_STUDIO_HOME, join(homedir(), "Projects", "motion-studio")].filter(Boolean).map((d) => resolve(d));
  return dirs.map((d) => join(d, "bin", "motion-studio.mjs")).find((f) => existsSync(f)) ?? null;
}

const bin = findStudio();
if (!bin) {
  console.error("Motion Studio đã tách repo: git clone https://github.com/abm-dungtq/motion-studio ~/Projects/motion-studio");
  process.exit(2);
}
const child = spawn(process.execPath, [bin, ...process.argv.slice(2)], { stdio: "inherit" });
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
