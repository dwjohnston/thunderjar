import path from 'path';
import type { BenchConfig } from './types.ts';

export async function loadConfig(): Promise<BenchConfig> {
  const configPath = path.resolve(process.cwd(), 'thunderjar.config.ts');
  const mod = await import(configPath);
  return mod.default as BenchConfig;
}
