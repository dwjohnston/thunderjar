#!/usr/bin/env bun
import { createProgram } from "./program.ts";

try {
  await createProgram().parseAsync();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
