/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: e8517e32-709f-4f31-9faf-184c2b14189e
 *
 *
 * Humans: add your notes here
 *
 *
 */

// What the viewer shows when it breaks, instead of a blank page: the error and its stack.
import { Component, type ReactNode } from "react";

/** An error the app couldn't recover from, shown in full. */
export function Failure({ error }: { error: unknown }) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  return (
    <main className="failure">
      <h1>The viewer broke</h1>
      <p className="error">{message}</p>
      {stack && <pre>{stack}</pre>}
      <p className="muted">The browser's console may say more.</p>
    </main>
  );
}

/** Shows a Failure in place of `children` if they throw as they render. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error?: unknown }> {
  override state: { error?: unknown } = {};

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  override render() {
    return "error" in this.state ? <Failure error={this.state.error} /> : this.props.children;
  }
}
