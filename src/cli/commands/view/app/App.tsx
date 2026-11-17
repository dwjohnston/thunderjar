// The viewer, following the task → execution → run hierarchy. Routed by the URL's hash, so the
// server only ever serves one page:
//
//   #/                                      every task
//   #/tasks/<task>                          the task's executions, from any test case
//   #/executions/<ID>                       one execution's permutations
//   #/executions/<ID>/runs/<permutation>-<iteration>   one container run
//
// The navigation shows where the screen sits in the hierarchy, and the toggle for parameter hashes.
import { useEffect, useState } from "react";
import { type Crumb, ShowHashesContext, TrailContext, useShowHashes } from "./common.tsx";
import { Execution } from "./Execution.tsx";
import { Run } from "./Run.tsx";
import { TaskHistory } from "./TaskHistory.tsx";
import { Tasks } from "./Tasks.tsx";

function useHash(): string {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onChange = () => setHash(location.hash);
    addEventListener("hashchange", onChange);
    return () => removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

/** The screen at `hash`. */
function Screen({ hash }: { hash: string }) {
  const run = /^#\/executions\/([^/]+)\/runs\/([^/]+)$/.exec(hash);
  if (run) return <Run executionId={decodeURIComponent(run[1]!)} run={decodeURIComponent(run[2]!)} />;
  const execution = /^#\/executions\/([^/]+)$/.exec(hash);
  if (execution) return <Execution id={decodeURIComponent(execution[1]!)} />;
  const task = /^#\/tasks\/([^/]+)$/.exec(hash);
  if (task) return <TaskHistory task={decodeURIComponent(task[1]!)} />;
  return <Tasks />;
}

const LEVEL_CLASS: Record<Crumb["level"], string> = { task: "l1", execution: "l2", run: "l3" };

function Nav({ trail, showHashes, setShowHashes }: { trail: Crumb[]; showHashes: boolean; setShowHashes: (show: boolean) => void }) {
  const current = trail.at(-1)?.href ?? "#/";
  return (
    <nav aria-label="Where you are">
      <div className="brand">
        thunderjar view<small>the run data store</small>
      </div>
      <a href="#/" className={current === "#/" ? "on" : undefined}>
        <span className="lvl">all tasks</span>Tasks
      </a>
      {trail.map((crumb) => (
        <a key={crumb.href} href={crumb.href} className={`${LEVEL_CLASS[crumb.level]}${crumb.href === current ? " on" : ""}`}>
          <span className="lvl">{crumb.level}</span>
          {crumb.level === "task" ? crumb.label : <span className="mono">{crumb.label}</span>}
          {crumb.detail !== undefined && <small>{crumb.detail}</small>}
        </a>
      ))}
      <label className="toggle">
        <input type="checkbox" checked={showHashes} onChange={(e) => setShowHashes(e.target.checked)} /> Show parameter hashes
      </label>
    </nav>
  );
}

export function App() {
  const hash = useHash();
  const [trail, setTrail] = useState<Crumb[]>([]);
  const [showHashes, setShowHashes] = useShowHashes();
  useEffect(() => {
    scrollTo(0, 0);
  }, [hash]);
  return (
    <ShowHashesContext.Provider value={showHashes}>
      <TrailContext.Provider value={setTrail}>
        <div className="app">
          <Nav trail={trail} showHashes={showHashes} setShowHashes={setShowHashes} />
          <main>
            <Screen key={hash} hash={hash} />
          </main>
        </div>
      </TrailContext.Provider>
    </ShowHashesContext.Provider>
  );
}
