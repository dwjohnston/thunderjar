// The viewer: a list of executions, and one execution's container runs. Routed by the URL's hash,
// `#/` or `#/executions/<ID>`, so the server only ever serves one page.
import { useEffect, useState } from "react";
import type { ContainerRunRecord, ExecutionRecord, RecordedMeasure } from "../../../../store/runDataStore.ts";
import { agentEnd, dollars, duration, knownCost, minute, plural, type RunTotals, runTotals, thousands, totalTokens } from "../../../format.ts";
import type { Axis } from "../../../../config/permutations.ts";
import type { ExecutionSummary } from "../view.ts";
import {
  commonParameters,
  groupByPermutation,
  PARAMETER_COLUMNS,
  parameterText,
  type Summary,
  summariseAgent,
  summariseCost,
  summariseDuration,
  summariseMeasure,
  summariseTokens,
} from "./aggregate.ts";

type Loaded<T> = { state: "loading" } | { state: "loaded"; data: T } | { state: "error"; message: string };

/** The JSON at `url`, refetched whenever it changes. */
function useJson<T>(url: string): Loaded<T> {
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

function useHash(): string {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onChange = () => setHash(location.hash);
    addEventListener("hashchange", onChange);
    return () => removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

function Status({ status }: { status: ExecutionRecord["status"] }) {
  return <span className={`status-${status}`}>{status}</span>;
}

function Pending<T>({ loaded, children }: { loaded: Loaded<T>; children: (data: T) => React.ReactNode }) {
  if (loaded.state === "loading") return <p className="muted">Loading…</p>;
  if (loaded.state === "error") return <p className="error">{loaded.message}</p>;
  return <>{children(loaded.data)}</>;
}

/** How long an execution took, or a dash if it hasn't ended. Its JSON may have `finishedAt: null`. */
const executionDuration = ({ startedAt, finishedAt }: ExecutionRecord) =>
  !finishedAt ? "—" : duration(Date.parse(finishedAt) - Date.parse(startedAt));

/** A total, starred with how many runs it covers if that leaves any out, or a dash if it covers none. */
function Total({ value, covered, runs }: { value: string | undefined; covered: number; runs: number }) {
  if (value === undefined) return <span className="muted">—</span>;
  if (covered === runs) return <>{value}</>;
  return <span title={`Of the ${covered} of ${runs} runs that reported it`}>{value}*</span>;
}

function TokensTotal({ totals }: { totals: RunTotals }) {
  return <Total value={totals.tokens === undefined ? undefined : thousands(totals.tokens)} covered={totals.withTokens} runs={totals.runs} />;
}

function CostTotal({ totals }: { totals: RunTotals }) {
  return <Total value={totals.costUsd === undefined ? undefined : dollars(totals.costUsd)} covered={totals.withCost} runs={totals.runs} />;
}

/** A dash, explained on hover, for a run without tokens or a cost. */
const Missing = ({ why }: { why: string }) => (
  <span className="muted" title={why}>
    —
  </span>
);

/** Why a run has no tokens. */
function noTokens({ tokenCosts }: ContainerRunRecord): string {
  if (tokenCosts === undefined) return "Not recorded: the run predates token costs";
  if (tokenCosts.outcome === "unavailable") return `Not reported (${tokenCosts.reason})`;
  return "Not reported";
}

/** Why a run has no cost it can be trusted for. */
function noCost(run: ContainerRunRecord): string {
  if (run.tokenCosts?.outcome !== "collected") return noTokens(run);
  if (run.tokenCosts.models.some(({ costBasis }) => costBasis === "unknown")) return "Not reported: the harness's price table doesn't know the model";
  return "Not reported by the harness";
}

function TokensCell({ run }: { run: ContainerRunRecord }) {
  const tokens = totalTokens(run.tokenCosts);
  return <td>{tokens === undefined ? <Missing why={noTokens(run)} /> : thousands(tokens)}</td>;
}

function CostCell({ run }: { run: ContainerRunRecord }) {
  const cost = knownCost(run.tokenCosts);
  return <td>{cost === undefined ? <Missing why={noCost(run)} /> : dollars(cost)}</td>;
}

function Executions() {
  const loaded = useJson<ExecutionSummary[]>("/api/executions");
  return (
    <>
      <h1>Executions</h1>
      <Pending loaded={loaded}>
        {(executions) =>
          executions.length === 0 ? (
            <p className="muted">No executions recorded.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Execution</th>
                  <th>Test case</th>
                  <th>Task</th>
                  <th>Started (UTC)</th>
                  <th>Matrix</th>
                  <th>Duration</th>
                  <th>Tokens</th>
                  <th>Cost</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {executions.map((e) => (
                  <tr key={e.executionId}>
                    <td>
                      <a href={`#/executions/${e.executionId}`}>
                        <code>{e.executionId}</code>
                      </a>
                    </td>
                    <td>{e.testCase}</td>
                    <td>{e.task}</td>
                    <td>{minute(e.startedAt)}</td>
                    <td>
                      {plural(e.matrix.permutations, "permutation")} × {plural(e.matrix.iterations, "iteration")}
                    </td>
                    <td>{executionDuration(e)}</td>
                    <td>
                      <TokensTotal totals={e.totals} />
                    </td>
                    <td>
                      <CostTotal totals={e.totals} />
                    </td>
                    <td>
                      <Status status={e.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </Pending>
    </>
  );
}

/** A measure's value, or why it has none. */
function measureText({ outcome }: RecordedMeasure): string {
  if (outcome.outcome === "measured") return JSON.stringify(outcome.data);
  if (outcome.outcome === "skipped") return `skipped${outcome.reason === undefined ? "" : `: ${outcome.reason}`}`;
  return `errored: ${outcome.error.message}`;
}

function MeasureCell({ measure }: { measure: RecordedMeasure | undefined }) {
  const text = measure === undefined ? "" : measureText(measure);
  return <td className="measure">{text}</td>;
}

/** A summary, with its smaller line beneath it if it has one. */
function SummaryCell({ summary, className }: { summary: Summary | undefined; className?: string }) {
  if (summary === undefined)
    return (
      <td>
        <span className="muted">—</span>
      </td>
    );
  return (
    <td className={className}>
      {summary.text}
      {summary.detail !== undefined && <span className="detail">{summary.detail}</span>}
    </td>
  );
}

/** One container run's row. */
function RunRow({ run, columns, measurements, nested }: { run: ContainerRunRecord; columns: Axis[]; measurements: string[]; nested?: boolean }) {
  return (
    <tr className={nested ? "iteration" : undefined}>
      <td>
        {run.permutation}-{run.iteration}
      </td>
      {columns.map((axis) => (
        <td key={axis}>{parameterText(run, axis)}</td>
      ))}
      <td>{duration(run.execution.finishedAt - run.execution.startedAt)}</td>
      <td>{agentEnd(run.execution, run.harnessResult)}</td>
      <TokensCell run={run} />
      <CostCell run={run} />
      {measurements.map((name) => (
        <MeasureCell key={name} measure={run.result[name]} />
      ))}
    </tr>
  );
}

/** A permutation's iterations as one row, summarised, which expands to show each of them. */
function PermutationRows({
  permutation,
  runs,
  columns,
  measurements,
  open,
  onToggle,
}: {
  permutation: number;
  runs: ContainerRunRecord[];
  columns: Axis[];
  measurements: string[];
  open: boolean;
  onToggle: () => void;
}) {
  if (runs.length === 1) return <RunRow run={runs[0]!} columns={columns} measurements={measurements} />;
  return (
    <>
      <tr className={`permutation${open ? " open" : ""}`} onClick={onToggle} aria-expanded={open}>
        <td>
          <span className="chevron">▶</span> {permutation}
          <span className="detail">×{runs.length} iterations</span>
        </td>
        {columns.map((axis) => (
          <td key={axis}>{parameterText(runs[0]!, axis)}</td>
        ))}
        <SummaryCell summary={summariseDuration(runs)} />
        <SummaryCell summary={summariseAgent(runs)} />
        <SummaryCell summary={summariseTokens(runs)} />
        <SummaryCell summary={summariseCost(runs)} />
        {measurements.map((name) => (
          <SummaryCell key={name} className="measure" summary={summariseMeasure(runs.map((run) => run.result[name]))} />
        ))}
      </tr>
      {open && runs.map((run) => <RunRow key={run.iteration} run={run} columns={columns} measurements={measurements} nested />)}
    </>
  );
}

/** One execution's container runs, a row per permutation, and the parameters they all share. */
function ContainerRuns({ containerRuns }: { containerRuns: ContainerRunRecord[] }) {
  const [hideCommon, setHideCommon] = useState(true);
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  const measurements = [...new Set(containerRuns.flatMap((run) => Object.keys(run.result)))];
  const permutations = groupByPermutation(containerRuns);
  const common = commonParameters(containerRuns);
  const hidden = new Set(hideCommon ? common.map(({ axis }) => axis) : []);
  const columns = PARAMETER_COLUMNS.filter(({ axis }) => !hidden.has(axis));
  const expandable = permutations.filter(({ runs }) => runs.length > 1).map(({ permutation }) => permutation);
  const toggle = (permutation: number) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(permutation)) next.add(permutation);
      return next;
    });

  return (
    <>
      <p className="controls muted">
        <label>
          <input type="checkbox" checked={hideCommon} onChange={(e) => setHideCommon(e.target.checked)} /> Hide common parameters
        </label>
        {expandable.length > 0 && (
          <>
            {" · "}
            <button type="button" className="link" onClick={() => setOpen(new Set(expandable))}>
              Expand all
            </button>
            {" · "}
            <button type="button" className="link" onClick={() => setOpen(new Set())}>
              Collapse all
            </button>
          </>
        )}
      </p>
      {hideCommon && common.length > 0 && (
        <p className="muted">
          Common to all runs:{" "}
          {common.map(({ axis, label, value }, i) => (
            <span key={axis}>
              {i > 0 && " · "}
              {label} <strong className="common-value">{value}</strong>
            </span>
          ))}
        </p>
      )}
      <table>
        <thead>
          <tr>
            <th>Run</th>
            {columns.map(({ axis, label }) => (
              <th key={axis}>{label}</th>
            ))}
            <th>Duration</th>
            <th>Agent</th>
            <th>Tokens</th>
            <th>Cost</th>
            {measurements.map((name) => (
              <th key={name}>{name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {permutations.map(({ permutation, runs }) => (
            <PermutationRows
              key={permutation}
              permutation={permutation}
              runs={runs}
              columns={columns.map(({ axis }) => axis)}
              measurements={measurements}
              open={open.has(permutation)}
              onToggle={() => toggle(permutation)}
            />
          ))}
        </tbody>
      </table>
    </>
  );
}

function Execution({ id }: { id: string }) {
  const loaded = useJson<{ execution: ExecutionRecord; containerRuns: ContainerRunRecord[] }>(`/api/executions/${encodeURIComponent(id)}`);
  return (
    <>
      <p>
        <a href="#/">← Executions</a>
      </p>
      <Pending loaded={loaded}>
        {({ execution, containerRuns }) => {
          const totals = runTotals(containerRuns);
          return (
            <>
              <h1>
                {execution.testCase} <span className="muted">· {minute(execution.startedAt)} UTC ·</span> <Status status={execution.status} />
              </h1>
              <p className="muted">
                <code>{execution.executionId}</code> · task {execution.task} · {plural(execution.matrix.permutations, "permutation")} ×{" "}
                {plural(execution.matrix.iterations, "iteration")}
              </p>
              <p>
                Took {executionDuration(execution)} · <TokensTotal totals={totals} /> tokens · <CostTotal totals={totals} />
              </p>
              {containerRuns.length === 0 ? <p className="muted">No container runs recorded.</p> : <ContainerRuns containerRuns={containerRuns} />}
            </>
          );
        }}
      </Pending>
    </>
  );
}

export function App() {
  const hash = useHash();
  const match = /^#\/executions\/([^/]+)$/.exec(hash);
  return <main>{match ? <Execution id={decodeURIComponent(match[1]!)} /> : <Executions />}</main>;
}
