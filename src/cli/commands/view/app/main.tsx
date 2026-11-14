import { createRoot } from "react-dom/client";
import { ErrorBoundary, Failure } from "./ErrorBoundary.tsx";

const root = createRoot(document.getElementById("root")!);

// App is imported dynamically, so that an error as its modules load, e.g. one that reaches for
// Node's `process`, is shown rather than leaving the page blank. The boundary catches the rest.
import("./App.tsx").then(
  ({ App }) =>
    root.render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>,
    ),
  (error) => root.render(<Failure error={error} />),
);
