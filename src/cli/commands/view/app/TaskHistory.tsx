// One task's history: every execution of it, from any test case, newest first. Parameters differ
// between executions, and one name can have several hashes, so each row lists its own.
import { useState } from "react";
import { dollars, duration, minute, plural, showStat } from "../../../format.ts";
import type { PermutationSummary } from "../../../../execution/executionSummary.ts";
import type { TaskExecution } from "../view.ts";
import {
  CostTotal,
  Crumbs,
  distinctParameters,
  executionHref,
  PARAMETER_COLUMNS,
  ParameterList,
  Pending,
  shortId,
  Status,
  taskHref,
  Unclean,
  useJson,
  useTrail,
  varyingAxes,
} from "./common.tsx";

/** A permutation's aggregated metrics, as `name.metric value`. */
function metricsText(execution: TaskExecution, permutation: PermutationSummary): string[] {
  return execution.summary.measurements.flatMap(({ name, metrics }) =>
    metrics.flatMap((metric) => {
      const aggregated = permutation.measures[name]?.metrics[metric.name];
      if (aggregated?.value === undefined) return [];
      return [`${name}.${metric.name} ${showStat(metric.stat, aggregated.value, aggregated.applicable)}`];
    }),
  );
}

function ExecutionRows({ execution, open, onToggle }: { execution: TaskExecution; open: boolean; onToggle: () => void }) {
  const { summary, parameters, totals } = execution;
  const record = summary.execution;
  const distinct = distinctParameters(parameters);
  const varying = varyingAxes(parameters);
  const unclean = summary.permutations.reduce((n, p) => n + p.unclean.length, 0);
  const expected = record.matrix.permutations * record.matrix.iterations;
  return (
    <>
      <tr className={`expandable${open ? " open" : ""}`} onClick={onToggle} aria-expanded={open} tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onToggle())}>
        <td>
          <span className="caret">›</span>
        </td>
        <td>
          <div>{minute(record.startedAt)}</div>
          <Status status={record.status} />
        </td>
        <td>
          <a href={executionHref(record.executionId)} onClick={(e) => e.stopPropagation()}>
            <code>{shortId(record.executionId)}</code>
          </a>
          <div className="muted small">{record.testCase}</div>
        </td>
        <td className="wrap">
          <div className="params">
            {PARAMETER_COLUMNS.filter(({ axis }) => distinct[axis].length > 0).map(({ axis, label }) => (
              <div key={axis}>
                <span className="muted">{label}</span> <ParameterList parameters={distinct[axis]} />
              </div>
            ))}
          </div>
        </td>
        <td>
          <div>
            {totals.runs === expected ? totals.runs : `${totals.runs} of ${expected}`}{" "}
            <span className="muted">· {plural(record.matrix.iterations, "iteration")} each</span>
          </div>
          <Unclean count={unclean} />
        </td>
        <td className="num">
          <CostTotal totals={totals} />
        </td>
      </tr>
      {open && (
        <>
          <tr className="subrow heading">
            <td></td>
            <td colSpan={2}>Permutation</td>
            <td>Measures</td>
            <td>Agents</td>
            <td className="num">Cost (mean)</td>
          </tr>
          {summary.permutations.map((permutation) => {
            const params = parameters[permutation.permutation - 1];
            const metrics = metricsText(execution, permutation);
            return (
              <tr key={permutation.permutation} className="subrow">
                <td></td>
                <td colSpan={2} className="wrap">
                  <span className="muted mono">{permutation.permutation}</span>{" "}
                  {params ? <ParameterList parameters={(varying.length > 0 ? varying : ["harnessModel" as const]).map((axis) => params[axis])} /> : <span className="muted">no container runs</span>}
                </td>
                <td className="wrap">{metrics.length === 0 ? <span className="muted">no values</span> : metrics.map((m) => <div key={m}>{m}</div>)}</td>
                <td>
                  {permutation.iterations === 0 ? (
                    <span className="muted">—</span>
                  ) : (
                    <>
                      <Unclean count={permutation.unclean.length} />
                      {permutation.durationMs && <div className="muted small">{duration(permutation.durationMs.mean)} mean</div>}
                    </>
                  )}
                </td>
                <td className="num">{permutation.costUsd ? dollars(permutation.costUsd.mean) : <span className="muted">—</span>}</td>
              </tr>
            );
          })}
        </>
      )}
    </>
  );
}

function History({ executions }: { executions: TaskExecution[] }) {
  const [testCase, setTestCase] = useState("all");
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const testCases = [...new Set(executions.map(({ summary }) => summary.execution.testCase))];
  const shown = executions.filter(({ summary }) => testCase === "all" || summary.execution.testCase === testCase);
  const allOpen = shown.length > 0 && shown.every(({ summary }) => open.has(summary.execution.executionId));
  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{plural(shown.length, "execution")}</h2>
        <div className="spacer" />
        <label className="inline">
          Test case{" "}
          <select value={testCase} onChange={(e) => setTestCase(e.target.value)}>
            <option value="all">all</option>
            {testCases.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => setOpen(allOpen ? new Set() : new Set(shown.map(({ summary }) => summary.execution.executionId)))}>
          {allOpen ? "Collapse all" : "Expand all"}
        </button>
      </div>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th className="caret-col"></th>
              <th>Started (UTC)</th>
              <th>Execution</th>
              <th>Parameters</th>
              <th>Runs</th>
              <th className="num">Cost</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((execution) => {
              const id = execution.summary.execution.executionId;
              return <ExecutionRows key={id} execution={execution} open={open.has(id)} onToggle={() => toggle(id)} />;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TaskHistory({ task }: { task: string }) {
  const loaded = useJson<TaskExecution[]>(`/api/tasks/${encodeURIComponent(task)}`);
  const trail = [{ level: "task" as const, label: task, href: taskHref(task) }];
  useTrail(trail);
  return (
    <>
      <Crumbs trail={trail} />
      <h1>{task}</h1>
      <p className="sub">Every execution of this task, from any test case, newest first. Parameters differ between executions, so each row lists its own.</p>
      <Pending loaded={loaded}>{(executions) => <History executions={executions} />}</Pending>
    </>
  );
}
