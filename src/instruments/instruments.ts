// The built-in measuring instruments. Each one's logic runs on the host, against a
// MeasurementContext, which does the work inside the measurement container; so each is
// unit-testable against a fake context over a folder.
import type { InstrumentName, InstrumentTypes, Stat } from "../api/declarations.ts";
import { bunTestFile } from "./bunTestFile/bunTestFile.ts";
import { commits } from "./commits/commits.ts";
import { fileCreated } from "./fileCreated/fileCreated.ts";
import { filesChanged } from "./filesChanged/filesChanged.ts";
import { grep } from "./grep/grep.ts";
import type { Instrument, ScoreKind } from "./instrument.ts";
import { replyMatches } from "./replyMatches/replyMatches.ts";
import { shell } from "./shell/shell.ts";

export type { Instrument, ScoreKind } from "./instrument.ts";
export { bunTestFile, commits, fileCreated, filesChanged, grep, replyMatches, shell };
export { STDOUT_LIMIT } from "./shell/shell.ts";

/** Every built-in instrument, by the name a measurement gives as its `instrument`. */
export const instruments: {
  [I in InstrumentName]: Instrument<InstrumentTypes[I]["config"], InstrumentTypes[I]["value"]>;
} = { fileCreated, grep, bunTestFile, replyMatches, shell, commits, filesChanged };

export const isInstrumentName = (name: unknown): name is InstrumentName => typeof name === "string" && Object.hasOwn(instruments, name);

/** Every statistic a metric can have, by the kind of score it combines: StatFor, at runtime. */
export const STATS: Record<Stat, ScoreKind> = {
  rate: "boolean",
  count: "boolean",
  mean: "number",
  median: "number",
  min: "number",
  max: "number",
  sum: "number",
};

export const isStat = (stat: unknown): stat is Stat => typeof stat === "string" && Object.hasOwn(STATS, stat);
