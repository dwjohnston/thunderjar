/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiApELUXheYNb6d7F3
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

/** The files an image holds, by path. */
export type ImageFiles = Record<string, string>;

/**
 * An image registry in memory. Several FakeDockers can be built over one, as a host and a runtime
 * share a real one: what one pushes, the other finds and pulls.
 */
export class FakeRegistry {
  private readonly stored = new Map<string, ImageFiles>();

  /** Puts `reference` in the registry, holding `files`. */
  add(reference: string, files: ImageFiles = {}): this {
    this.stored.set(reference, { ...files });
    return this;
  }

  has(reference: string): boolean {
    return this.stored.has(reference);
  }

  /** The files `reference` holds, or undefined if it isn't here. */
  files(reference: string): ImageFiles | undefined {
    const files = this.stored.get(reference);
    return files === undefined ? undefined : { ...files };
  }

  remove(reference: string): void {
    this.stored.delete(reference);
  }

  /** Every reference, in the order each was first added. */
  references(): string[] {
    return [...this.stored.keys()];
  }
}
