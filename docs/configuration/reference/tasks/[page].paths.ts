// A task's declarations, one page each: see ../[page].paths.ts.
import { sectionPage } from "../sectionPage.ts";

const PAGES = [
  { page: "initial-prompt", title: "Initial prompt", sections: ["declareInitialPrompt"] },
  { page: "measurement", title: "Measurement", sections: ["declareMeasurement"] },
];

export default {
  paths() {
    return PAGES.map(({ page, title, sections }) => ({ params: { page }, content: sectionPage(title, sections) }));
  },
};
