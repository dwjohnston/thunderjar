#!/usr/bin/env bun
import { createProgram } from "./program.ts";

await createProgram().parseAsync();
