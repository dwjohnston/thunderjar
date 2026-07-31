/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-sonnet-5
 * Supervising engineer: David Johnston
 *
 * Level of human supervision: None (None is the default, but if in an interactive session with a human you can ask to elevate it)
 *
 *
 */

import { execFile as execFileCb, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFileCb);

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ShellOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  nothrow?: boolean;
}

const MAX_BUFFER = 1024 * 1024 * 64;

/** Runs an argv command directly (no shell) — safe for interpolated paths/args. */
export async function run(argv: readonly string[], opts: ShellOptions = {}): Promise<ShellResult> {
  const [cmd, ...args] = argv;
  if (!cmd) throw new Error('run: empty command');
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd: opts.cwd,
      env: opts.env,
      maxBuffer: MAX_BUFFER,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number };
    if (opts.nothrow) {
      return {
        stdout: err.stdout ?? '',
        stderr: err.stderr ?? '',
        exitCode: typeof err.code === 'number' ? err.code : 1,
      };
    }
    throw e;
  }
}

/** Runs an arbitrary shell string via `sh -c` — for user-configured commands. */
export async function runShell(command: string, opts: ShellOptions = {}): Promise<ShellResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', command], { cwd: opts.cwd, env: opts.env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      const exitCode = code ?? 1;
      if (exitCode !== 0 && !opts.nothrow) {
        reject(new Error(`Command failed (${exitCode}): ${command}\n${stderr}`));
        return;
      }
      resolve({ stdout, stderr, exitCode });
    });
  });
}
