// The viewer: a list of executions, and one execution's container runs. Routed by the URL's hash,
// `#/` or `#/executions/<ID>`, so the server only ever serves one page.
import { useEffect, useState } from "react";
import type { ContainerRunRecord, ExecutionRecord, RecordedMeasure } from "../../../../store/runDataStore.ts";
import { agentEnd, dollars, duration, knownCost, minute, plural, type RunTotals, runTotals, showAggregate, thousands, totalTokens } from "../../../format.ts";
import type { Axis } from "../../../../config/permutations.ts";
import type { AggregatedMeasure, AggregateMethod } from "../../../../execution/aggregate.ts";
import type { ExecutionSummary, PermutationSummary, Spread } from "../../../../execution/executionSummary.ts";
import type { ExecutionPage, ExecutionSummary as ExecutionListItem } from "../view.ts";

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
  const loaded = useJson<ExecutionListItem[]>("/api/executions");
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

function MeasureCell({ measure, span }: { measure: RecordedMeasure | undefined; span: number }) {
  const text = measure === undefined ? "" : measureText(measure);
  return (
    <td className="measure" colSpan={span}>
      {text}
    </td>
  );
}

/** The parameter columns, in the order the table shows them. */
const PARAMETER_COLUMNS: { axis: Axis; label: string }[] = [
  { axis: "baseImage", label: "Base image" },
  { axis: "codeState", label: "Code state" },
  { axis: "promptSet", label: "Prompt set" },
  { axis: "initialPrompt", label: "Initial prompt" },
  { axis: "harnessModel", label: "Harness / model" },
];

const harnessModelText = ({ harness, model, modelId }: ContainerRunRecord["harnessModel"]) => `${harness} / ${model ?? modelId}`;

/** A value, with a smaller line beneath it if there is one. */
function Cell({ text, detail, title, className }: { text: React.ReactNode; detail?: string; title?: string; className?: string }) {
  return (
    <td className={className} title={title}>
      {text}
      {detail !== undefined && <span className="detail">{detail}</span>}
    </td>
  );
}

/** A spread's mean, with its range beneath if its values differ, and how many runs it covers if not all. */
function SpreadCell({ spread, iterations, show, missing }: { spread: Spread | undefined; iterations: number; show: (n: number) => string; missing: string }) {
  if (spread === undefined) return <Cell text={<Missing why={missing} />} />;
  const range = spread.min === spread.max ? undefined : `${show(spread.min)}–${show(spread.max)}`;
  const of = spread.of < iterations ? `of ${spread.of}/${iterations} runs` : undefined;
  return <Cell text={show(spread.mean)} detail={[range, of].filter(Boolean).join(" · ") || undefined} />;
}

/** How a permutation's agents ended: `5/5 done`, or `4 done · 1 exited 1`. */
const agentText = ({ agent, iterations }: PermutationSummary) =>
  agent.length === 1 ? `${agent[0]!.runs}/${iterations} ${agent[0]!.end}` : agent.map(({ end, runs }) => `${runs} ${end}`).join(" · ");

/** One measure's aggregate by one method, starred if it leaves an iteration out; `?` if its values don't combine. */
function AggregateCell({ measure, method, iterations }: { measure: AggregatedMeasure | undefined; method: AggregateMethod; iterations: number }) {
  if (measure?.incompatible !== undefined) return <Cell className="measure" text="?" title={`Can't aggregate as declared today: ${measure.incompatible}`} />;
  const value = measure?.values[method];
  if (measure === undefined || value === undefined) return <Cell text={<Missing why="No iteration measured it" />} />;
  const partial = measure.measured < iterations;
  return (
    <Cell
      className="measure"
      text={`${showAggregate(method, value, measure.measured)}${partial ? "*" : ""}`}
      title={partial ? `Of the ${measure.measured} of ${iterations} iterations that measured it` : undefined}
    />
  );
}

type Columns = { axes: Axis[]; measurements: ExecutionSummary["measurements"] };

/** One container run's row: a measure's recorded value spans its measurement's methods. */
function RunRow({ run, columns, nested }: { run: ContainerRunRecord; columns: Columns; nested?: boolean }) {
  return (
    <tr className={nested ? "iteration" : undefined}>
      <td>
        {run.permutation}-{run.iteration}
      </td>
      {columns.axes.map((axis) => (
        <td key={axis}>{axis === "harnessModel" ? harnessModelText(run.harnessModel) : run.parameters[axis].name}</td>
      ))}
      <td>{duration(run.execution.finishedAt - run.execution.startedAt)}</td>
      <td>{agentEnd(run.execution, run.harnessResult)}</td>
      <TokensCell run={run} />
      <CostCell run={run} />
      {columns.measurements.map(({ name, aggregate }) => (
        <MeasureCell key={name} measure={run.result[name]} span={aggregate.length} />
      ))}
    </tr>
  );
}

/** A permutation as one row, its iterations aggregated, which expands to show each of them. */
function PermutationRows({
  summary,
  runs,
  columns,
  open,
  onToggle,
}: {
  summary: PermutationSummary;
  runs: ContainerRunRecord[];
  columns: Columns;
  open: boolean;
  onToggle: () => void;
}) {
  const { permutation, parameters, harnessModel, iterations, measures } = summary;
  if (parameters === undefined) {
    return (
      <tr>
        <td>{permutation}</td>
        <td colSpan={99} className="muted">
          No container runs recorded.
        </td>
      </tr>
    );
  }
  return (
    <>
      <tr className={`permutation${open ? " open" : ""}`} onClick={onToggle} aria-expanded={open}>
        <Cell text={<><span className="chevron">▶</span> {permutation}</>} detail={plural(iterations, "iteration")} />
        {columns.axes.map((axis) => (
          <td key={axis}>{axis === "harnessModel" && harnessModel ? harnessModelText(harnessModel) : parameters[axis]}</td>
        ))}
        <SpreadCell spread={summary.durationMs} iterations={iterations} show={duration} missing="" />
        <Cell text={agentText(summary)} />
        <SpreadCell spread={summary.tokens} iterations={iterations} show={thousands} missing="Not reported" />
        <SpreadCell spread={summary.costUsd} iterations={iterations} show={dollars} missing="Not reported" />
        {columns.measurements.flatMap(({ name, aggregate }) =>
          aggregate.map((method) => <AggregateCell key={`${name}-${method}`} measure={measures[name]} method={method} iterations={iterations} />),
        )}
      </tr>
      {open && runs.map((run) => <RunRow key={run.iteration} run={run} columns={columns} nested />)}
    </>
  );
}

/** One execution's permutations, aggregated as `show` does, and the parameters they all share. */
function Permutations({ summary, containerRuns }: ExecutionPage) {
  const [hideCommon, setHideCommon] = useState(true);
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  const { commonParameters, measurements, permutations } = summary;
  const hidden = new Set(hideCommon ? commonParameters.map(({ axis }) => axis) : []);
  const parameterColumns = PARAMETER_COLUMNS.filter(({ axis }) => !hidden.has(axis));
  const columns: Columns = { axes: parameterColumns.map(({ axis }) => axis), measurements };
  const all = permutations.filter(({ iterations }) => iterations > 0).map(({ permutation }) => permutation);
  const toggle = (permutation: number) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(permutation)) next.add(permutation);
      return next;
    });
  const label = (axis: Axis) => PARAMETER_COLUMNS.find((column) => column.axis === axis)!.label;

  return (
    <>
      <p className="controls muted">
        <label>
          <input type="checkbox" checked={hideCommon} onChange={(e) => setHideCommon(e.target.checked)} /> Hide common parameters
        </label>
        {" · "}
        <button type="button" className="link" onClick={() => setOpen(new Set(all))}>
          Expand all
        </button>
        {" · "}
        <button type="button" className="link" onClick={() => setOpen(new Set())}>
          Collapse all
        </button>
      </p>
      {hideCommon && commonParameters.length > 0 && (
        <p className="muted">
          Common to all runs:{" "}
          {commonParameters.map(({ axis, name }, i) => (
            <span key={axis}>
              {i > 0 && " · "}
              {label(axis)} <strong className="common-value">{name}</strong>
            </span>
          ))}
        </p>
      )}
      <table>
        <thead>
          <tr>
            {["Run", ...parameterColumns.map(({ label }) => label), "Duration", "Agent", "Tokens", "Cost"].map((heading) => (
              <th key={heading} rowSpan={2}>
                {heading}
              </th>
            ))}
            {measurements.map(({ name, aggregate }) => (
              <th key={name} colSpan={aggregate.length} className="measurement">
                {name}
              </th>
            ))}
          </tr>
          <tr>
            {measurements.flatMap(({ name, aggregate }) =>
              aggregate.map((method) => (
                <th key={`${name}-${method}`} className="method">
                  {method}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {permutations.map((permutation) => (
            <PermutationRows
              key={permutation.permutation}
              summary={permutation}
              runs={containerRuns.filter((run) => run.permutation === permutation.permutation)}
              columns={columns}
              open={open.has(permutation.permutation)}
              onToggle={() => toggle(permutation.permutation)}
            />
          ))}
        </tbody>
      </table>
    </>
  );
}

function Execution({ id }: { id: string }) {
  const loaded = useJson<ExecutionPage>(`/api/executions/${encodeURIComponent(id)}`);
  return (
    <>
      <p>
        <a href="#/">← Executions</a>
      </p>
      <Pending loaded={loaded}>
        {(page) => {
          const { execution } = page.summary;
          const totals = runTotals(page.containerRuns);
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
              {page.containerRuns.length === 0 ? <p className="muted">No container runs recorded.</p> : <Permutations {...page} />}
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
