import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Failure } from "./ErrorBoundary.tsx";

test("Failure shows the error's name, message and stack", () => {
  const html = renderToStaticMarkup(<Failure error={new ReferenceError("process is not defined")} />);

  expect(html).toContain("ReferenceError: process is not defined");
  expect(html).toContain("<pre>");
});

test("Failure shows something that isn't an Error as text, with no stack", () => {
  const html = renderToStaticMarkup(<Failure error="nope" />);

  expect(html).toContain("nope");
  expect(html).not.toContain("<pre>");
});
