/**
 * The layers of src/, lowest first: one per top-level folder.
 *
 * A file may import from its own layer and the layers before it, never from one after it.
 * Add a layer when its first module arrives, then run `bun run lint:generate`.
 */
export const LAYERS: readonly string[] = ["testing", "api", "config", "docker", "git", "execution", "cli"];
