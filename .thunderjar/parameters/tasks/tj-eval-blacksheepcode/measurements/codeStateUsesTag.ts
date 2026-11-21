import { declareMeasurement } from "thunderjar";

// Does a new code state name the tj-codestate-1 tag in its resolve, rather than only in applyParameter?
// In the captured session it did: the thing to keep.
//
// It reads the files, so it holds whether or not the agent committed them. A code state is a file
// `.thunderjar/parameters/codeStates/*/index.ts` that names the tag anywhere; neither code state the
// test case starts with does, so none needs excluding. Every such file must name it in resolve.
// The script is run with bun, which the image has, and prints `[{ file, inResolve }]`.
const SCRIPT = `
const TAG = "tj-codestate-1";
const files = [...new Bun.Glob(".thunderjar/parameters/codeStates/*/index.ts").scanSync({ dot: true })].sort();
// The text of the first {...} after "resolve", braces balanced.
const resolveBody = (text) => {
  const start = text.search(/\\bresolve\\s*[:(]/);
  const open = start < 0 ? -1 : text.indexOf("{", start);
  if (open < 0) return "";
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    if (text[i] === "}" && --depth === 0) return text.slice(open, i + 1);
  }
  return text.slice(open);
};
const named = [];
for (const file of files) {
  const text = await Bun.file(file).text();
  if (text.includes(TAG)) named.push({ file, inResolve: resolveBody(text).includes(TAG) });
}
console.log(JSON.stringify(named));
`;

export default declareMeasurement({
  instrument: "shell",
  config: { command: `bun - <<'SCRIPT'\n${SCRIPT}\nSCRIPT` },
  metrics: {
    usesTag: {
      stat: "rate",
      better: "higher",
      score: ({ exitCode, stdout }) => {
        if (exitCode !== 0) return false;
        const named: { inResolve: boolean }[] = JSON.parse(stdout);
        return named.length > 0 && named.every(({ inResolve }) => inResolve);
      },
    },
  },
});
