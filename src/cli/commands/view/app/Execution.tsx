/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLghxvZzzr9duMfVbGv
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// One execution: its permutations, aggregated as `show` does, each expanding to its container
// runs, and the runs whose agent didn't end cleanly.
import { useState } from "react";
import type { Axis } from "../../../../config/permutations.ts";
import type { AggregatedMetric } from "../../../../execution/aggregate.ts";
import { type ExecutionSummary, type PermutationSummary, runName, type Spread } from "../../../../execution/executionSummary.ts";
import type { ContainerRunRecord, RecordedMeasure } from "../../../../store/runDataStore.ts";
import { agentEnd, dollars, duration, endedCleanly, failureHint, minute, plural, runTotals, showStat, thousands } from "../../../format.ts";
import type { ExecutionPage, Parameter } from "../view.ts";
import {
  AgentEnd,
  axisLabel,
  CostTotal,
  type Crumb,
  Crumbs,
  executionDuration,
  executionHref,
  matrixText,
  Missing,
  PARAMETER_COLUMNS,
  ParameterList,
  ParameterName,
  Pending,
  RunCost,
  runHref,
  runParameters,
  RunTokens,
  shortId,
  Status,
  taskHref,
  TokensTotal,
  useJson,
  useTrail,
  varyingAxes,
} from "./common.tsx";

/** A measure's value, or why it has none. */
export function measureText({ outcome }: RecordedMeasure): string {
  if (outcome.outcome === "measured") return JSON.stringify(outcome.data);
  if (outcome.outcome === "skipped") return `skipped${outcome.reason === undefined ? "" : `: ${outcome.reason}`}`;
  return `errored: ${outcome.error.message}`;
}

/** A value, with a smaller line beneath it if there is one. */
function Cell({ text, detail, title, className }: { text: React.ReactNode; detail?: React.ReactNode; title?: string; className?: string }) {
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
function AgentsCell({ summary }: { summary: PermutationSummary }) {
  const { agent, iterations, unclean } = summary;
  const text = agent.length === 1 ? `${agent[0]!.runs}/${iterations} ${agent[0]!.end}` : agent.map(({ end, runs }) => `${runs} ${end}`).join(" · ");
  return <Cell text={unclean.length === 0 ? <span className="chip good">{text}</span> : <span className="chip bad">{text}</span>} />;
}

/** One metric's statistic, starred if it leaves an iteration out. */
function MetricCell({ metric, iterations }: { metric: AggregatedMetric | undefined; iterations: number }) {
  if (metric === undefined || metric.value === undefined) return <Cell text={<Missing why="No iteration has a score for it" />} />;
  const partial = metric.applicable < iterations;
  return (
    <Cell
      className="measure"
      text={`${showStat(metric.stat, metric.value, metric.applicable)}${partial ? "*" : ""}`}
      title={partial ? `Of the ${metric.applicable} of ${iterations} iterations with a score for it` : undefined}
    />
  );
}

type Columns = { axes: Axis[]; measurements: ExecutionSummary["measurements"] };

/** One container run's row: a measure's recorded value spans its measurement's metrics. */
function RunRow({ run, columns }: { run: ContainerRunRecord; columns: Columns }) {
  const name = runName(run);
  const why = endedCleanly(run.execution, run.harnessResult) ? undefined : failureHint(run);
  const parameters = runParameters(run);
  return (
    <tr className="subrow">
      <td>
        <a href={runHref(run.executionId, name)}>
          <code>{name}</code>
        </a>
        {why !== undefined && <span className="detail why">{why}</span>}
      </td>
      {columns.axes.map((axis) => (
        <td key={axis}>
          <ParameterName parameter={parameters[axis]} />
        </td>
      ))}
      <td>{duration(run.execution.finishedAt - run.execution.startedAt)}</td>
      <td>
        <AgentEnd end={agentEnd(run.execution, run.harnessResult)} />
      </td>
      <td>
        <RunTokens run={run} />
      </td>
      <td>
        <RunCost run={run} />
      </td>
      {columns.measurements.map(({ name: measurement, metrics }) => (
        <td key={measurement} className="measure" colSpan={metrics.length}>
          {run.result[measurement] === undefined ? "" : measureText(run.result[measurement]!)}
        </td>
      ))}
    </tr>
  );
}

/** A permutation as one row, its iterations aggregated, which expands to show each of them. */
function PermutationRows({
  summary,
  parameters,
  runs,
  columns,
  open,
  onToggle,
}: {
  summary: PermutationSummary;
  parameters: Record<Axis, Parameter> | null;
  runs: ContainerRunRecord[];
  columns: Columns;
  open: boolean;
  onToggle: () => void;
}) {
  const { permutation, iterations, measures } = summary;
  if (parameters === null) {
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
      <tr
        className={`expandable${open ? " open" : ""}`}
        onClick={onToggle}
        aria-expanded={open}
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onToggle())}
      >
        <Cell text={<><span className="caret">›</span> {permutation}</>} detail={plural(iterations, "iteration")} />
        {columns.axes.map((axis) => (
          <td key={axis}>
            <ParameterName parameter={parameters[axis]} />
          </td>
        ))}
        <SpreadCell spread={summary.durationMs} iterations={iterations} show={duration} missing="" />
        <AgentsCell summary={summary} />
        <SpreadCell spread={summary.tokens} iterations={iterations} show={thousands} missing="Not reported" />
        <SpreadCell spread={summary.costUsd} iterations={iterations} show={dollars} missing="Not reported" />
        {columns.measurements.flatMap(({ name, metrics }) =>
          metrics.map((metric) => <MetricCell key={`${name}-${metric.name}`} metric={measures[name]?.metrics[metric.name]} iterations={iterations} />),
        )}
      </tr>
      {open && runs.map((run) => <RunRow key={run.iteration} run={run} columns={columns} />)}
    </>
  );
}

/** One execution's permutations, and the parameters they all share. */
function Permutations({ summary, parameters, containerRuns }: ExecutionPage) {
  const [hideCommon, setHideCommon] = useState(true);
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  const { measurements, permutations } = summary;
  const varying = new Set(varyingAxes(parameters));
  const first = parameters.find((p) => p !== null) ?? null;
  const common = first === null ? [] : PARAMETER_COLUMNS.filter(({ axis }) => !varying.has(axis)).map(({ axis }) => ({ axis, parameter: first[axis] }));
  const parameterColumns = PARAMETER_COLUMNS.filter(({ axis }) => !hideCommon || varying.has(axis));
  const columns: Columns = { axes: parameterColumns.map(({ axis }) => axis), measurements };
  const all = permutations.filter(({ iterations }) => iterations > 0).map(({ permutation }) => permutation);
  const allOpen = all.length > 0 && all.every((p) => open.has(p));
  const toggle = (permutation: number) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(permutation)) next.add(permutation);
      return next;
    });

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Permutations</h2>
        <div className="spacer" />
        <label className="inline">
          <input type="checkbox" checked={hideCommon} onChange={(e) => setHideCommon(e.target.checked)} /> Hide common parameters
        </label>
        <button type="button" onClick={() => setOpen(allOpen ? new Set() : new Set(all))}>
          {allOpen ? "Collapse all" : "Expand all"}
        </button>
      </div>
      {hideCommon && common.length > 0 && (
        <div className="panel-body common muted">
          Common to all runs:{" "}
          {common.map(({ axis, parameter }, i) => (
            <span key={axis}>
              {i > 0 && " · "}
              {axisLabel(axis)} <strong className="common-value"><ParameterName parameter={parameter} /></strong>
            </span>
          ))}
        </div>
      )}
      <div className="scroll">
        <table>
          <thead>
            <tr>
              {["Run", ...parameterColumns.map(({ label }) => label), "Duration", "Agents", "Tokens", "Cost"].map((heading) => (
                <th key={heading} rowSpan={2}>
                  {heading}
                </th>
              ))}
              {measurements.map(({ name, metrics }) => (
                <th key={name} colSpan={metrics.length} className="measurement">
                  {name}
                </th>
              ))}
            </tr>
            <tr>
              {measurements.flatMap(({ name, metrics }) =>
                metrics.map((metric) => (
                  <th key={`${name}-${metric.name}`} className="method" title={`${name}.${metric.name}, by ${metric.stat}`}>
                    {metric.name}
                    {metric.better === "higher" ? " ↑" : metric.better === "lower" ? " ↓" : ""}
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
                parameters={parameters[permutation.permutation - 1] ?? null}
                runs={containerRuns.filter((run) => run.permutation === permutation.permutation)}
                columns={columns}
                open={open.has(permutation.permutation)}
                onToggle={() => toggle(permutation.permutation)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The runs whose agent exited non-zero, timed out, or left no result file, and why. */
function UncleanRuns({ summary, parameters }: Pick<ExecutionPage, "summary" | "parameters">) {
  const varying = varyingAxes(parameters);
  const rows = summary.permutations.flatMap((permutation) => permutation.unclean.map((unclean) => ({ ...unclean, permutation: permutation.permutation })));
  if (rows.length === 0) return null;
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Agents that didn't end cleanly</h2>
      </div>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Run</th>
              <th>Parameters</th>
              <th>End</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ run, end, why, permutation }) => {
              const params = parameters[permutation - 1];
              return (
                <tr key={run}>
                  <td>
                    <a href={runHref(summary.execution.executionId, run)}>
                      <code>{run}</code>
                    </a>
                  </td>
                  <td>{params && <ParameterList parameters={(varying.length > 0 ? varying : ["harnessModel" as const]).map((axis) => params[axis])} />}</td>
                  <td>
                    <AgentEnd end={end} />
                  </td>
                  <td className="wrap">{why === undefined ? <span className="muted">no stderr</span> : <span className="why">{why}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The navigation trail to an execution, and from it to one of its runs. */
export const executionTrail = (page: ExecutionPage): Crumb[] => {
  const { execution } = page.summary;
  return [
    { level: "task", label: execution.task, href: taskHref(execution.task) },
    { level: "execution", label: shortId(execution.executionId), href: executionHref(execution.executionId), detail: minute(execution.startedAt).slice(0, 10) },
  ];
};

function ExecutionScreen({ page }: { page: ExecutionPage }) {
  const { execution } = page.summary;
  const trail = executionTrail(page);
  useTrail(trail);
  const totals = runTotals(page.containerRuns);
  const unclean = page.summary.permutations.reduce((n, p) => n + p.unclean.length, 0);
  return (
    <>
      <Crumbs trail={trail} />
      <h1>
        {execution.testCase} <span className="muted">· {minute(execution.startedAt)} UTC</span>
      </h1>
      <div className="facts">
        <span>
          Status <Status status={execution.status} />
        </span>
        <span>
          Matrix <b>{matrixText(execution)}</b>
        </span>
        <span>
          Iterations <b>{execution.matrix.iterations}</b>
        </span>
        <span>
          Runs <b>{totals.runs}</b>
          {unclean > 0 && (
            <>
              , <b className="bad">{unclean} unclean</b>
            </>
          )}
        </span>
        <span>
          Took <b>{executionDuration(execution)}</b>
        </span>
        <span>
          Tokens <b><TokensTotal totals={totals} /></b>
        </span>
        <span>
          Cost <b><CostTotal totals={totals} /></b>
        </span>
      </div>
      <p className="muted small">
        <code>{execution.executionId}</code> · task {execution.task}
      </p>
      {page.containerRuns.length === 0 ? (
        <p className="muted">No container runs recorded.</p>
      ) : (
        <>
          <Permutations {...page} />
          <UncleanRuns summary={page.summary} parameters={page.parameters} />
        </>
      )}
    </>
  );
}

export function Execution({ id }: { id: string }) {
  const loaded = useJson<ExecutionPage>(`/api/executions/${encodeURIComponent(id)}`);
  return <Pending loaded={loaded}>{(page) => <ExecutionScreen page={page} />}</Pending>;
}
