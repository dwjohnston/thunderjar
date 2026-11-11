// The viewer: a list of executions, and one execution's container runs. Routed by the URL's hash,
// `#/` or `#/executions/<ID>`, so the server only ever serves one page.
import { useEffect, useState } from "react";
import type { ContainerRunRecord, ExecutionRecord, RecordedMeasure } from "../../../../store/runDataStore.ts";
import { agentEnd, dollars, duration, knownCost, minute, plural, type RunTotals, runTotals, thousands, totalTokens } from "../../../format.ts";
import type { ExecutionSummary } from "../view.ts";

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
  return <td>{text}</td>;
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
          const measurements = [...new Set(containerRuns.flatMap((run) => Object.keys(run.result)))];
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
              {containerRuns.length === 0 ? (
                <p className="muted">No container runs recorded.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Run</th>
                      <th>Code state</th>
                      <th>Prompt set</th>
                      <th>Harness / model</th>
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
                    {containerRuns.map((run) => (
                      <tr key={`${run.permutation}-${run.iteration}`}>
                        <td>
                          {run.permutation}-{run.iteration}
                        </td>
                        <td>{run.parameters.codeState?.name}</td>
                        <td>{run.parameters.promptSet?.name}</td>
                        <td>
                          {run.harnessModel.harness} / {run.harnessModel.model ?? run.harnessModel.modelId}
                        </td>
                        <td>{duration(run.execution.finishedAt - run.execution.startedAt)}</td>
                        <td>{agentEnd(run.execution, run.harnessResult)}</td>
                        <TokensCell run={run} />
                        <CostCell run={run} />
                        {measurements.map((name) => (
                          <MeasureCell key={name} measure={run.result[name]} />
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
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
