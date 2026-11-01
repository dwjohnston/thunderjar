// Placeholders, so the files `thunderjar init` scaffolds have something to import. Each returns
// what it is given. Any callback in a declaration takes `any` arguments, so a scaffolded project
// type-checks without annotations until the declarations get real types.
type Callback = (...args: any[]) => unknown;
type Value = Callback | string | number | boolean | null | undefined | readonly Value[] | { [key: string]: Value };
type Declaration = Callback | { [key: string]: Value };

const placeholder =
  () =>
  <T extends Declaration>(declaration: T): T =>
    declaration;

export const declareConfig = placeholder();
export const sqliteStore = placeholder();
export const declareTestCase = placeholder();
export const declareBaseImage = placeholder();
export const declareCodeState = placeholder();
export const declarePromptSet = placeholder();
export const declareHarness = placeholder();
export const declareHarnessModels = placeholder();
export const declareHarnessVersions = placeholder();
export const declareTokenCostCollector = placeholder();
export const declareInitialPrompt = placeholder();
export const declareMeasurement = placeholder();
