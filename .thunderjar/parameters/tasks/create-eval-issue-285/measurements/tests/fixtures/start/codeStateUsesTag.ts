import { declareMeasurement } from "thunderjar";

// Does a new code state name the tj-codestate-1 tag in its resolve, rather than only in applyParameter?
// In the captured session it did: the thing to keep.
//
// It reads the files, so it holds whether or not the agent committed them. Every code state that
// names the tag must name it inside resolve, and at least one must. Neither code state the test
// case starts with names it, so none needs excluding.
const TAG = "/tj-codestate-1/";
// A template string's text is at value.cooked.
const NAMES_TAG = `:matches(Literal[value=${TAG}], TemplateElement[value.cooked=${TAG}])`;

export default declareMeasurement({
  instrument: "jsAst",
  config: {
    glob: ".thunderjar/parameters/codeStates/*/index.ts",
    selectors: { anywhere: NAMES_TAG, inResolve: `:matches(Property, MethodDefinition)[key.name="resolve"] ${NAMES_TAG}` },
  },
  metrics: {
    usesTag: {
      stat: "rate",
      better: "higher",
      score: (files) => {
        const naming = files.filter(({ matches }) => (matches.anywhere ?? 0) > 0);
        return naming.length > 0 && naming.every(({ matches }) => (matches.inResolve ?? 0) > 0);
      },
    },
  },
});
