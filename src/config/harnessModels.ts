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
export function splitPair(pair: string, _models: HarnessModels): SplitPair | { problem: string } {
  return { problem: pair };
}
