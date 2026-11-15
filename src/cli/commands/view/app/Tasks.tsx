// The top of the hierarchy: every task the store has executions of.
import { minute } from "../../../format.ts";
import type { TaskSummary } from "../view.ts";
import { executionHref, Pending, shortId, Status, taskHref, useJson, useTrail } from "./common.tsx";

export function Tasks() {
  const loaded = useJson<TaskSummary[]>("/api/tasks");
  useTrail([]);
  return (
    <>
      <h1>Tasks</h1>
      <p className="sub">Every task this project has executions of. Open one to see its history across test cases.</p>
      <Pending loaded={loaded}>
        {(tasks) =>
          tasks.length === 0 ? (
            <p className="muted">No executions recorded.</p>
          ) : (
            <div className="panel">
              <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Task</th>
                      <th>Test cases</th>
                      <th className="num">Executions</th>
                      <th>Last ran (UTC)</th>
                      <th>Latest execution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map(({ task, testCases, executions, latest }) => (
                      <tr key={task}>
                        <td>
                          <a href={taskHref(task)}>{task}</a>
                        </td>
                        <td className="muted wrap">{testCases.join(", ")}</td>
                        <td className="num">{executions}</td>
                        <td>{minute(latest.startedAt)}</td>
                        <td>
                          <a href={executionHref(latest.executionId)}>
                            <code>{shortId(latest.executionId)}</code>
                          </a>{" "}
                          <Status status={latest.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        }
      </Pending>
    </>
  );
}
