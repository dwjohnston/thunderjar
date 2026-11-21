// A harness's declared models, and the pair names they make: `<harness>/<model ID>/<variant part>…`.
import type { HarnessModels, ModelSetting, SettingValue } from "../api/declarations.ts";

/** One name a model makes: the model ID with its variant parts, and its settings with each variant's value chosen. */
export type ModelVariant = { name: string; modelId: string; model: Record<string, SettingValue> };

/** Whether a setting's value is a variant, `{ values: [...] }`. */
export const isVariant = (value: unknown): value is { values: readonly SettingValue[] } =>
  typeof value === "object" && value !== null && Array.isArray((value as { values?: unknown }).values);

/**
 * Every name `modelId` makes with `settings`: a fixed setting adds no part, a variant setting one
 * part per value, and several variant settings their cross product, parts in array order.
 */
export function modelVariants(modelId: string, settings: readonly ModelSetting[]): ModelVariant[] {
  let variants: ModelVariant[] = [{ name: modelId, modelId, model: {} }];
  for (const setting of settings) {
    for (const [key, value] of Object.entries(setting)) {
      variants = isVariant(value)
        ? variants.flatMap((variant) => value.values.map((chosen) => ({ ...variant, name: `${variant.name}/${chosen}`, model: { ...variant.model, [key]: chosen } })))
        : variants.map((variant) => ({ ...variant, model: { ...variant.model, [key]: value } }));
    }
  }
  return variants;
}

/** A pair, split: its harness folder, its model ID, and the model's settings with each variant's value chosen. */
export type SplitPair = { harness: string; modelId: string; model: Record<string, SettingValue> };

/**
 * `pair`, split by `models`, its harness's declared models: the harness folder, then the longest
 * declared model ID that matches, then one part per variant setting. A problem if it names none.
 */
export function splitPair(pair: string, models: HarnessModels): SplitPair | { problem: string } {
  const slash = pair.indexOf("/");
  const harness = pair.slice(0, slash);
  const rest = pair.slice(slash + 1);
  const modelId = Object.keys(models)
    .filter((id) => rest === id || rest.startsWith(`${id}/`))
    .toSorted((a, b) => b.length - a.length)[0];
  if (modelId === undefined) return { problem: `${JSON.stringify(pair)} is not a model of ${harness}. Its models: ${Object.keys(models).join(", ")}` };
  const settings = models[modelId] ?? [];
  const variants = modelVariants(modelId, settings);
  const variant = variants.find((candidate) => candidate.name === rest);
  if (variant === undefined) {
    const names = variants.map(({ name }) => name).join(", ");
    const parts = rest === modelId ? [] : rest.slice(modelId.length + 1).split("/");
    const keys = settings.flatMap((setting) => Object.entries(setting).filter(([, value]) => isVariant(value)).map(([key]) => key));
    const missing = keys[parts.length];
    if (missing !== undefined) return { problem: `${JSON.stringify(pair)} names no ${missing}. Its names: ${names}` };
    return { problem: pair };
  }
  return { harness, modelId, model: variant.model };
}
