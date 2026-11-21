// A harness's declared models, and the pair names they make: `<harness>/<model ID>/<variant part>…`.
import type { ModelSetting, SettingValue } from "../api/declarations.ts";

/** One name a model makes: the model ID with its variant parts, and its settings with each variant's value chosen. */
export type ModelVariant = { name: string; modelId: string; model: Record<string, SettingValue> };

/**
 * Every name `modelId` makes with `settings`: a fixed setting adds no part, a variant setting one
 * part per value, and several variant settings their cross product, parts in array order.
 */
export function modelVariants(_modelId: string, _settings: readonly ModelSetting[]): ModelVariant[] {
  return [];
}
