import { spawnSync } from "node:child_process";
import { platform } from "node:os";

/** Disable XON/XOFF so Ctrl+S / Ctrl+Q reach the TUI instead of freezing the terminal. */
export function disableTerminalFlowControl(): void {
  if (!process.stdin.isTTY || platform() === "win32") return;

  const saved = spawnSync("stty", ["-g"], { encoding: "utf8" });
  if (saved.status !== 0 || !saved.stdout.trim()) return;

  const prior = saved.stdout.trim();
  spawnSync("stty", ["-ixon"], { stdio: "inherit" });
  process.on("exit", () => {
    spawnSync("stty", [prior], { stdio: "inherit" });
  });
}
