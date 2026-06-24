import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { z } from "zod";
import type { ToolRegistry } from "@relay/tool-registry";

const MAX_FILE_SIZE = 64 * 1024;

const ALLOWED_COMMANDS = new Set(["pwd", "ls", "cat"]);

const fileReadSchema = z.object({
  path: z.string(),
});

const shellExecSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional().default([]),
});

function assertAllowedReadPath(path: string, cwd: string): string {
  const resolved = isAbsolute(path) ? path : resolve(cwd, path);
  const realCwd = realpathSync.native(cwd);
  let realPath: string;
  try {
    realPath = realpathSync.native(resolved);
  } catch {
    realPath = resolved;
  }

  const rel = relative(realCwd, realPath);
  if (rel.startsWith("..") || rel === "") {
    if (rel === "") {
      const base = realPath.split("/").pop() ?? realPath;
      if (base === ".env" || base.startsWith(".env.")) {
        throw new Error("Reading .env files is not allowed");
      }
      return realPath;
    }
    throw new Error("Path escapes working directory");
  }

  const base = realPath.split("/").pop() ?? realPath;
  if (base === ".env" || base.startsWith(".env.")) {
    throw new Error("Reading .env files is not allowed");
  }
  return realPath;
}

async function fileRead(input: unknown, cwd: string): Promise<unknown> {
  const { path } = fileReadSchema.parse(input);
  const resolved = assertAllowedReadPath(path, cwd);
  const content = await readFile(resolved, "utf-8");
  if (content.length > MAX_FILE_SIZE) {
    throw new Error(`File exceeds max size of ${MAX_FILE_SIZE} bytes`);
  }
  return { path: resolved, content };
}

async function shellExec(input: unknown, cwd: string): Promise<unknown> {
  const { command, args } = shellExecSchema.parse(input);
  const baseCmd = command.split(" ")[0] ?? command;

  if (!ALLOWED_COMMANDS.has(baseCmd)) {
    throw new Error(`Command not allowed: ${baseCmd}. Allowed: ${[...ALLOWED_COMMANDS].join(", ")}`);
  }

  if (baseCmd === "cat") {
    for (const arg of args) {
      assertAllowedReadPath(arg, cwd);
    }
  }

  const proc = Bun.spawn([baseCmd, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      ...(process.env.HOME !== undefined ? { HOME: process.env.HOME } : {}),
      ...(process.env.LANG !== undefined ? { LANG: process.env.LANG } : {}),
      ...(process.env.TMPDIR !== undefined ? { TMPDIR: process.env.TMPDIR } : {}),
    },
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;

  return {
    command: baseCmd,
    args,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
    exitCode,
  };
}

export function registerTools(registry: ToolRegistry, cwd = process.cwd()): void {
  registry.register(
    {
      name: "file.read",
      description: "Read the contents of a file from the local filesystem",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to the file to read" },
        },
        required: ["path"],
      },
    },
    fileReadSchema,
    (input) => fileRead(input, cwd),
  );

  registry.register(
    {
      name: "shell.exec",
      description: "Execute a read-only shell command (pwd, ls, cat only)",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Command to run (pwd, ls, or cat)" },
          args: { type: "array", items: { type: "string" }, description: "Command arguments" },
        },
        required: ["command"],
      },
    },
    shellExecSchema,
    (input) => shellExec(input, cwd),
  );
}
