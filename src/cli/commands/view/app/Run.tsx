// One container run: its parameters, by name and hash, its measures, and what its agent left.
import { runName } from "../../../../execution/executionSummary.ts";
import type { ContainerRunRecord } from "../../../../store/runDataStore.ts";
import { agentEnd, duration, endedCleanly, minute, showResolved } from "../../../format.ts";
import type { ExecutionPage } from "../view.ts";
import { AgentEnd, PARAMETER_COLUMNS, ParameterList, ParameterName, Pending, RunCost, runHref, runParameters, RunTokens, shortHash, useJson, useTrail, varyingAxes, Crumbs } from "./common.tsx";
import { executionTrail, measureText } from "./Execution.tsx";

/** How many lines of a long text the page shows, from its end. */
const TAIL = 40;

function TextPanel({ title, text, empty }: { title: string; text: string | null | undefined; empty: string }) {
  const lines = text?.split("\n") ?? [];
  const shown = lines.length > TAIL ? lines.slice(-TAIL) : lines;
  const hasText = text !== null && text !== undefined && text.trim() !== "";
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        <span className="muted small">{!hasText ? "empty" : lines.length > TAIL ? `last ${TAIL} lines of ${lines.length}` : `${lines.length} lines`}</span>
      </div>
      <div className="panel-body">{hasText ? <pre className="log">{shown.join("\n")}</pre> : <span className="muted">{empty}</span>}</div>
    </div>
  );
}

function RunScreen({ page, run }: { page: ExecutionPage; run: ContainerRunRecord }) {
  const name = runName(run);
  const trail = [...executionTrail(page), { level: "run" as const, label: `run ${name}`, href: runHref(run.executionId, name) }];
  useTrail(trail);
  const parameters = runParameters(run);
  const varying = varyingAxes(page.parameters);
  const end = agentEnd(run.execution, run.harnessResult);
  const measurements = page.summary.measurements.map(({ name }) => name);
  const recordedOnly = Object.keys(run.result).filter((measurement) => !measurements.includes(measurement));
  return (
    <>
      <Crumbs trail={trail} />
      <h1>
        Run {name} <AgentEnd end={end} />
      </h1>
      <p className="sub">
        <ParameterList parameters={(varying.length > 0 ? varying : ["harnessModel" as const]).map((axis) => parameters[axis])} /> · iteration {run.iteration} of{" "}
        {page.summary.execution.matrix.iterations} · ran for {duration(run.execution.finishedAt - run.execution.startedAt)}
      </p>
      <div className="grid2">
        <div className="panel">
          <div className="panel-head">
            <h2>Parameters</h2>
          </div>
          <div className="panel-body">
            <dl className="kv">
              {PARAMETER_COLUMNS.map(({ axis, label }) => {
                const resolved = run.parameters[axis].resolved;
                return [
                  <dt key={`${axis}-dt`}>{label}</dt>,
                  <dd key={`${axis}-dd`}>
                    <ParameterName parameter={parameters[axis]} />
                    {resolved !== undefined && <span className="muted"> resolved to {showResolved(resolved)}</span>}
                  </dd>,
                ];
              })}
              <dt>Harness</dt>
              <dd>
                {run.harnessModel.harness} {run.harnessModel.version}
              </dd>
              <dt>Model</dt>
              <dd>{run.harnessModel.model ?? run.harnessModel.modelId}</dd>
              <dt>Permutation hash</dt>
              <dd>
                <code title={run.permutationHash}>{shortHash(run.permutationHash)}</code>
              </dd>
              <dt>Postrun image</dt>
              <dd>
                <code>{run.postrunImage}</code>
              </dd>
              <dt>Ran at</dt>
              <dd>{minute(run.ranAt)} UTC</dd>
              <dt>Tokens</dt>
              <dd>
                <RunTokens run={run} />
              </dd>
              <dt>Cost</dt>
              <dd>
                <RunCost run={run} />
              </dd>
            </dl>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <h2>Measures</h2>
          </div>
          {measurements.length + recordedOnly.length === 0 ? (
            <div className="panel-body muted">The task declares no measurements.</div>
          ) : (
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>Measure</th>
                    <th>Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {[...measurements, ...recordedOnly].map((measurement) => {
                    const measure = run.result[measurement];
                    return (
                      <tr key={measurement}>
                        <td>{measurement}</td>
                        <td className="measure">{measure === undefined ? <span className="muted">not measured</span> : measureText(measure)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {run.reply !== undefined && (
        <TextPanel title="Reply" text={run.reply.outcome === "collected" ? run.reply.text : null} empty={run.reply.outcome === "unavailable" ? `No reply: ${run.reply.reason}` : "No reply."} />
      )}
      <TextPanel
        title="Stderr"
        text={run.harnessStderr}
        empty={run.harnessStderr === undefined ? "Not recorded: the run predates stderr." : endedCleanly(run.execution, run.harnessResult) ? "The agent wrote nothing to stderr." : "No stderr."}
      />
      <TextPanel title="Result file" text={run.harnessResult} empty="The agent wrote nothing to its result file." />
    </>
  );
}

export function Run({ executionId, run }: { executionId: string; run: string }) {
  const loaded = useJson<ExecutionPage>(`/api/executions/${encodeURIComponent(executionId)}`);
  return (
    <Pending loaded={loaded}>
      {(page) => {
        const found = page.containerRuns.find((r) => runName(r) === run);
        if (found === undefined) return <p className="error">No run {run} recorded in execution {executionId}.</p>;
        return <RunScreen page={page} run={found} />;
      }}
    </Pending>
  );
}
