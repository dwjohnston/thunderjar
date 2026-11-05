// A stand-in for a command a parameter's `resolve` runs through `ctx.exec`, such as `git`: put
// first on the PATH of `thunderjar()`, so `ctx.exec("git ls-remote …")` runs it instead of the real
// one, and nothing reaches the network. Each call is recorded.
import { $ } from "bun";
import { TMP_DIR } from "./cli.ts";

export type FakeCommand = AsyncDisposable & {
  /** Pass to `thunderjar(cwd, args, { env })`. */
  env: Record<string, string>;
  /** The arguments of each call, so far, space-separated. */
  calls: () => Promise<string[]>;
  /** Deletes it. */
  remove: () => Promise<void>;
};

const shellQuote = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`;

/**
 * A fake `name`, which prints `stdout` and exits with `exitCode`, whatever it's given. Remove it
 * when done, or declare it with `await using`.
 */
export async function fakeCommand(name: string, { stdout = "", exitCode = 0 }: { stdout?: string; exitCode?: number } = {}): Promise<FakeCommand> {
  const dir = `${TMP_DIR}/command-${crypto.randomUUID()}`;
  await Bun.write(
    `${dir}/bin/${name}`,
    ["#!/bin/sh", `echo "$*" >> ${shellQuote(`${dir}/calls`)}`, `printf '%s\\n' ${shellQuote(stdout)}`, `exit ${exitCode}`, ""].join("\n"),
  );
  await $`chmod +x ${dir}/bin/${name}`.quiet();
  const remove = async () => {
    await $`rm -rf ${dir}`.quiet();
  };
  return {
    env: { PATH: `${dir}/bin:${Bun.env.PATH}` },
    calls: async () => {
      const file = Bun.file(`${dir}/calls`);
      return (await file.exists()) ? (await file.text()).split("\n").filter(Boolean) : [];
    },
    remove,
    [Symbol.asyncDispose]: remove,
  };
}
