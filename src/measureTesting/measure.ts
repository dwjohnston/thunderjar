export async function measure(..._args: unknown[]): Promise<{ outcome: string; metrics: Record<string, number | boolean | undefined> }> {
  return { outcome: "measured", metrics: {} };
}
