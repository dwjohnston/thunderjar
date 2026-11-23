/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiFLaxJLiUMbmTp2fu
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */
// The options every out-of-the-box harness helper shares: `provider`, where the agent sends its
// requests, and `command`, a function of `CommandContext` that gives the run script's command.
import type { HarnessModels, RequiredEnv, SettingValue } from "./declarations.ts";
import { MODEL_PATH, PROMPT_PATH, RESULT_PATH, USAGE_PATH } from "./files.ts";

/** A model provider other than the agent's own: its API's address, and the variable that holds its key. */
export type Provider = {
  /** The API's address, e.g. `"https://openrouter.ai/api/v1"`. */
  baseUrl: string;
  /** The environment variable that holds its key, e.g. `"OPENROUTER_API_KEY"`. Passed into the agent's container by name. */
  apiKeyEnv: string;
  /** Its display name, for an agent that shows one, e.g. `"OpenRouter"`. By default, from its host. */
  name?: string;
};

/** OpenRouter, by its OpenAI-compatible address. Each helper adapts it to the API its agent speaks. */
export const OPENROUTER = { name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", apiKeyEnv: "OPENROUTER_API_KEY" } as const satisfies Provider;

/** The API an agent speaks to its provider: Anthropic's Messages, OpenAI's Responses, or Chat Completions. */
export type WireApi = "anthropic" | "responses" | "chat";

/** A provider as a helper gives it to `command`: `baseUrl` as its agent takes it, and the API it speaks. */
export type CommandProvider = Provider & { wireApi: WireApi };

/** The files a run script reads and writes. */
export type CommandPaths = { prompt: string; model: string; result: string; usage: string };

export const COMMAND_PATHS: CommandPaths = { prompt: PROMPT_PATH, model: MODEL_PATH, result: RESULT_PATH, usage: USAGE_PATH };

/** What a helper's `command` gets. */
export type CommandContext<S = Record<string, SettingValue>> = {
  /** The model ID, as the agent takes it, e.g. `"claude-haiku-5-5"`. */
  modelId: string;
  /** The model's settings, with each variant's value the pair names, e.g. `{ effort: "high" }`. */
  model: S;
  /** The agent's version, e.g. `"2.1.311"`. */
  version: string;
  paths: CommandPaths;
  /** The provider, or undefined for the agent's own. */
  provider: CommandProvider | undefined;
};

/** A variable's value, read from another variable when the run script runs, e.g. `envRef("OPENROUTER_API_KEY")`. */
export type EnvRef = { env: string };

export const envRef = (name: string): EnvRef => ({ env: name });

/** Characters a value may hold and still go unquoted. */
const SAFE = /^[A-Za-z0-9_./:@%+=,-]+$/;

const quote = (value: string) => (SAFE.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`);

/**
 * Shell variable assignments, for the start of a command, e.g. `A=1 B="$KEY"`. A literal is
 * single-quoted unless it's safe as is. An `EnvRef` reads its variable when the command runs.
 */
export function envAssignments(vars: Record<string, string | EnvRef>): string {
  return Object.entries(vars)
    .map(([name, value]) => `${name}=${typeof value === "string" ? quote(value) : `"$${value.env}"`}`)
    .join(" ");
}

/** `value` single-quoted for the shell, whatever it holds. */
export const shellQuote = (value: string): string => `'${value.replaceAll("'", `'\\''`)}'`;

/**
 * A short name for the provider at `baseUrl`, from its host: the label before the top-level
 * domain, e.g. `openrouter` for `https://openrouter.ai/api/v1`.
 */
export function providerId(baseUrl: string): string {
  const labels = new URL(baseUrl).hostname.split(".");
  return (labels.length > 1 ? labels[labels.length - 2] : labels[0]) ?? "provider";
}

/**
 * A helper's `provider` and `models`: with no provider, the agent's own, and `models` defaults to
 * its own IDs. With one, `models` is required, as the defaults wouldn't be the provider's IDs.
 */
export type ProviderAndModels =
  | {
      /** The agent's own provider. */
      provider?: undefined;
      /** The models it runs, as `declareHarness`'s `models`. By default, the helper's own list. */
      models?: HarnessModels;
    }
  | {
      /** Another provider, e.g. `OPENROUTER`. */
      provider: Provider;
      /** The models it runs, by the provider's IDs: required, as the defaults are the agent's own provider's. */
      models: HarnessModels;
    };

/** The options every helper takes, with its `provider` and `models`. */
export type HelperOptions = {
  /** The version of the agent to install, e.g. `"0.166.0"`. */
  version: string;
  /** The command its run script runs, from the model, version, paths and provider. By default, the helper's own. */
  command?: (ctx: CommandContext) => string;
  /** The variables it needs, as `declareHarness`'s `requiredEnv`. By default, the provider's key, or the agent's own. */
  requiredEnv?: RequiredEnv[];
} & ProviderAndModels;
