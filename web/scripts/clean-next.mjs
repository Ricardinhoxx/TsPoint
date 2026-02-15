import { existsSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const nextDir = join(process.cwd(), ".next");
if (!existsSync(nextDir)) process.exit(0);

function tryNodeRm() {
  rmSync(nextDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

function tryPowerShellRm() {
  const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Test-Path '.next') { Remove-Item '.next' -Recurse -Force -ErrorAction Stop }"`;
  execSync(cmd, { stdio: "ignore" });
}

try {
  tryNodeRm();
} catch {
  try {
    tryPowerShellRm();
  } catch {
    // Fallback final: renomeia para destravar o dev server.
    const backupName = `.next_stale_${Date.now()}`;
    renameSync(nextDir, join(process.cwd(), backupName));
    console.warn(`[clean] .next travado. Renomeado para ${backupName}`);
  }
}

