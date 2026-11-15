// What the viewer's screens share: fetching, the parameter-hash toggle, chips, and totals.
import { createContext, useContext, useEffect, useState } from "react";
import { AXES, type Axis } from "../../../../config/permutations.ts";
import type { ContainerRunRecord, ExecutionRecord } from "../../../../store/runDataStore.ts";
import { dollars, duration, knownCost, type RunTotals, thousands, totalTokens } from "../../../format.ts";
import type { Parameter, PermutationParameters } from "../view.ts";

export type Loaded<T> = { state: "loading" } | { state: "loaded"; data: T } | { state: "error"; message: string };

/** The JSON at `url`, refetched whenever it changes. */
export function useJson<T>(url: string): Loaded<T> {
  const [loaded, setLoaded] = useState<Loaded<T>>({ state: "loading" });
  useEffect(() => {
    let current = true;
    setLoaded({ state: "loading" });
    fetch(url)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? res.statusText);
        if (current) setLoaded({ state: "loaded", data: body as T });
      })
      .catch((error: Error) => current && setLoaded({ state: "error", message: error.message }));
    return () => {
      current = false;
    };
  }, [url]);
  return loaded;
}

export function Pending<T>({ loaded, children }: { loaded: Loaded<T>; children: (data: T) => React.ReactNode }) {
  if (loaded.state === "loading") return <p className="muted">Loading…</p>;
  if (loaded.state === "error") return <p className="error">{loaded.message}</p>;
  return <>{children(loaded.data)}</>;
}

// ---------- Where a screen sits in the task → execution → run hierarchy ----------

/** One level of the hierarchy above, or at, the current screen. */
export type Crumb = { level: "task" | "execution" | "run"; label: string; href: string; detail?: string };

/** Lets a screen tell the navigation where it sits, once it knows. */
export const TrailContext = createContext<(trail: Crumb[]) => void>(() => {});

/** Reports `trail` to the navigation while the screen is shown. */
export function useTrail(trail: Crumb[] | undefined) {
  const setTrail = useContext(TrailContext);
  const key = JSON.stringify(trail ?? []);
  useEffect(() => {
    setTrail(JSON.parse(key) as Crumb[]);
  }, [key, setTrail]);
}

/** The breadcrumbs above a screen's heading: Tasks, then each level of `trail` but the last, which is the screen itself. */
export function Crumbs({ trail }: { trail: Crumb[] }) {
  return (
    <div className="crumbs">
      <a href="#/">Tasks</a>
      {trail.map((crumb, i) => (
        <span key={crumb.href}>
          {" / "}
          {i === trail.length - 1 ? crumb.label : <a href={crumb.href}>{crumb.label}</a>}
        </span>
      ))}
    </div>
  );
}

export const taskHref = (task: string) => `#/tasks/${encodeURIComponent(task)}`;
export const executionHref = (id: string) => `#/executions/${encodeURIComponent(id)}`;
export const runHref = (id: string, run: string) => `${executionHref(id)}/runs/${encodeURIComponent(run)}`;

/** An execution ID, shortened as the navigation shows it. ULIDs share their leading characters within a few days, so keep the end. */
export const shortId = (id: string) => `…${id.slice(-8)}`;

// ---------- Parameters, by name and parameter hash ----------

/** Whether to show each parameter's hash beside its name. */
export const ShowHashesContext = createContext(true);

const HASHES_KEY = "thunderjar.view.showHashes";

/** Whether to show parameter hashes, remembered across visits. */
export function useShowHashes(): [boolean, (show: boolean) => void] {
  const [show, setShow] = useState(() => {
    try {
      return localStorage.getItem(HASHES_KEY) !== "false";
    } catch {
      return true;
    }
  });
  const set = (next: boolean) => {
    setShow(next);
    try {
      localStorage.setItem(HASHES_KEY, String(next));
    } catch {
      // Storage may be unavailable, e.g. in a private window: the toggle still works for the visit.
    }
  };
  return [show, set];
}

/** The abbreviation the viewer shows, as `plan` and image tags do. */
export const shortHash = (hash: string) => hash.slice(0, 8);

/** The parameter columns and labels, in the order the viewer shows them. */
export const PARAMETER_COLUMNS: { axis: Axis; label: string; noun: string }[] = [
  { axis: "baseImage", label: "Base image", noun: "base image" },
  { axis: "codeState", label: "Code state", noun: "code state" },
  { axis: "promptSet", label: "Prompt set", noun: "prompt set" },
  { axis: "initialPrompt", label: "Initial prompt", noun: "initial prompt" },
  { axis: "harnessModel", label: "Harness / model", noun: "harness model" },
];

export const axisLabel = (axis: Axis) => PARAMETER_COLUMNS.find((column) => column.axis === axis)!.label;

/** A parameter's name, and its hash beside it unless hashes are hidden. */
export function ParameterName({ parameter }: { parameter: Parameter }) {
  const showHashes = useContext(ShowHashesContext);
  return (
    <span className="pn">
      {parameter.name}
      {showHashes && (
        <span className="ph" title={parameter.parameterHash}>
          {" "}
          ({shortHash(parameter.parameterHash)})
        </span>
      )}
    </span>
  );
}

/** Parameters, comma separated. */
export function ParameterList({ parameters }: { parameters: Parameter[] }) {
  return (
    <>
      {parameters.map((parameter, i) => (
        <span key={`${parameter.name}@${parameter.parameterHash}`} className="nw">
          {i > 0 && ", "}
          <ParameterName parameter={parameter} />
        </span>
      ))}
    </>
  );
}

/** Each axis's distinct parameters across `parameters`' permutations, by name and hash, in the order first seen. */
export function distinctParameters(parameters: PermutationParameters): Record<Axis, Parameter[]> {
  const distinct = Object.fromEntries(PARAMETER_COLUMNS.map(({ axis }) => [axis, [] as Parameter[]])) as Record<Axis, Parameter[]>;
  for (const permutation of parameters) {
    if (permutation === null) continue;
    for (const { axis } of PARAMETER_COLUMNS) {
      const parameter = permutation[axis];
      if (!distinct[axis].some((p) => p.name === parameter.name && p.parameterHash === parameter.parameterHash)) distinct[axis].push(parameter);
    }
  }
  return distinct;
}

/** A container run's parameters, as a permutation's. */
export const runParameters = (run: ContainerRunRecord): Record<Axis, Parameter> =>
  Object.fromEntries(
    PARAMETER_COLUMNS.map(({ axis }) => [axis, { name: run.parameters[axis].name, parameterHash: run.parameters[axis].parameterHash }]),
  ) as Record<Axis, Parameter>;

/** The axes whose parameter, by name or by hash, differs between `parameters`' permutations. */
export function varyingAxes(parameters: PermutationParameters): Axis[] {
  const distinct = distinctParameters(parameters);
  return PARAMETER_COLUMNS.map(({ axis }) => axis).filter((axis) => distinct[axis].length > 1);
}

// ---------- Chips and values ----------

const STATUS_KIND: Record<ExecutionRecord["status"], string> = { complete: "good", failed: "bad", running: "accent" };

export const Status = ({ status }: { status: ExecutionRecord["status"] }) => <span className={`chip ${STATUS_KIND[status]}`}>{status}</span>;

/** How an agent ended: muted if it ended cleanly, amber if it timed out, red otherwise. */
export function AgentEnd({ end }: { end: string }) {
  if (end === "done") return <span className="muted">done</span>;
  return <span className={`chip ${end.startsWith("timed out") ? "warn" : "bad"}`}>{end}</span>;
}

/** How many runs didn't end cleanly, or that all did. */
export const Unclean = ({ count }: { count: number }) =>
  count === 0 ? <span className="chip good">all done</span> : <span className="chip bad">{count} unclean</span>;

/** How long an execution took, or a dash if it hasn't ended. Its JSON may have `finishedAt: null`. */
export const executionDuration = ({ startedAt, finishedAt }: ExecutionRecord) =>
  !finishedAt ? "—" : duration(Date.parse(finishedAt) - Date.parse(startedAt));

/** A dash, explained on hover, for a value that's missing. */
export const Missing = ({ why }: { why: string }) => (
  <span className="muted" title={why}>
    —
  </span>
);

/** A total, starred with how many runs it covers if that leaves any out, or a dash if it covers none. */
function Total({ value, covered, runs }: { value: string | undefined; covered: number; runs: number }) {
  if (value === undefined) return <span className="muted">—</span>;
  if (covered === runs) return <>{value}</>;
  return <span title={`Of the ${covered} of ${runs} runs that reported it`}>{value}*</span>;
}

export const TokensTotal = ({ totals }: { totals: RunTotals }) => (
  <Total value={totals.tokens === undefined ? undefined : thousands(totals.tokens)} covered={totals.withTokens} runs={totals.runs} />
);

export const CostTotal = ({ totals }: { totals: RunTotals }) => (
  <Total value={totals.costUsd === undefined ? undefined : dollars(totals.costUsd)} covered={totals.withCost} runs={totals.runs} />
);

/** Why a run has no tokens. */
export function noTokens({ tokenCosts }: ContainerRunRecord): string {
  if (tokenCosts === undefined) return "Not recorded: the run predates token costs";
  if (tokenCosts.outcome === "unavailable") return `Not reported (${tokenCosts.reason})`;
  return "Not reported";
}

/** Why a run has no cost it can be trusted for. */
export function noCost(run: ContainerRunRecord): string {
  if (run.tokenCosts?.outcome !== "collected") return noTokens(run);
  if (run.tokenCosts.models.some(({ costBasis }) => costBasis === "unknown")) return "Not reported: the harness's price table doesn't know the model";
  return "Not reported by the harness";
}

export function RunTokens({ run }: { run: ContainerRunRecord }) {
  const tokens = totalTokens(run.tokenCosts);
  return tokens === undefined ? <Missing why={noTokens(run)} /> : <>{thousands(tokens)}</>;
}

export function RunCost({ run }: { run: ContainerRunRecord }) {
  const cost = knownCost(run.tokenCosts);
  return cost === undefined ? <Missing why={noCost(run)} /> : <>{dollars(cost)}</>;
}

/** An execution's matrix, by the axes with more than one parameter: `2 code states × 3 harness models`. */
export function matrixText({ matrix }: ExecutionRecord): string {
  const varying = PARAMETER_COLUMNS.map((column) => ({ ...column, size: matrix.shape[AXES.indexOf(column.axis)] ?? 1 }))
    .filter(({ size }) => size > 1)
    .map(({ size, noun }) => `${size} ${noun}s`);
  return varying.length === 0 ? "1 permutation" : varying.join(" × ");
}
