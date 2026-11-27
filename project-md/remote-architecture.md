<!--
🤖
This file was created with AI

Harness: Claude Code
Session Id: session_01LCLeLjgpo4Xt5XwzGG2TNX
Supervising engineer: David Johnston

Humans: add your notes here
-->

# Remote architecture: network calls

Who calls whom when `thunderjar run` uses a remote runtime (Fly), and how often. Edge labels give the frequency: per execution, per run, per measurement.

Runner mode (`runtime.runner`, `thunderjar attach`) is being removed, so neither diagram has it.

## 1. As described in #327: your machine drives everything

```mermaid
flowchart LR
  subgraph host["Your machine / CI"]
    tj["Thunderjar<br/>runCommand → scheduler → runPermutation<br/>Interrupts, UploadQueue, Displayer"]
    cli["docker CLI + Fly client"]
    tj -->|"every Docker call<br/>is a subprocess"| cli
  end

  subgraph fly["Fly machine"]
    dockerd["Docker daemon"]
    agent["Agent container"]
    meas["Measurement and<br/>secret-search containers"]
    dockerd --> agent
    dockerd --> meas
  end

  ghcr[("ghcr<br/>image store")]
  pg[("Supabase<br/>Postgres")]
  llm(["Model APIs<br/>Anthropic / OpenRouter"])

  cli <==>|"SSH (one shared connection)<br/>per execution: build contexts up, pulls<br/>per run: docker run held open for the agent,<br/>3× docker cp back, commit, secret search, rm<br/>per measurement: docker run/exec, output back<br/>Ctrl+C: rm -f containers, kill measurements"| dockerd
  tj -->|"per execution: inRegistry checks"| ghcr
  dockerd -->|"per execution: pull or push prerun<br/>per run: push postrun"| ghcr
  agent -->|"the agent's model calls"| llm
  tj -->|"check, execution record ×2<br/>per run: record ×2 (committed, measured)"| pg
```

- **The hot path is the SSH hop.**
  - One container run is about 8 round trips from your machine, plus 1 or 2 per measurement.
- **Interrupts**
  - 1st Ctrl+C: `docker rm -f` over SSH.
  - 2nd Ctrl+C: kills the local `docker` processes for measurements and pushes.
    - Ending the client is meant to make the daemon cancel the push. Not verified.
- **Your machine is a single point of failure.**
  - If it disconnects, every call in flight fails, the runs crash, and the execution is recorded `failed`.
- **The code differs from the architecture plan here.**
  - The plan has "the runtime machine connects to the Postgres database" as decided, but `runNext` connects from your machine.

## 2. Idealised: runNext runs on the Fly machine, your machine only watches

```mermaid
flowchart LR
  subgraph host["Your machine / CI"]
    thin["thunderjar run (thin client)<br/>Interrupts, Displayer"]
  end

  subgraph fly["Fly machine"]
    tjr["Thunderjar runCommand<br/>scheduler, runPermutation, UploadQueue,<br/>Interrupts (remote)"]
    sock["Docker socket"]
    dockerd["Docker daemon"]
    agent["Agent container"]
    meas["Measurement containers"]
    tjr -->|"local socket:<br/>no network"| sock --> dockerd
    dockerd --> agent
    dockerd --> meas
  end

  ghcr[("ghcr")]
  pg[("Supabase<br/>Postgres")]
  llm(["Model APIs"])

  thin ==>|"once: submit<br/>test case, git ref, overrides"| tjr
  tjr ==>|"one stream: RunState updates"| thin
  thin ==>|"Ctrl+C → windDown<br/>Ctrl+C again → forceQuit"| tjr
  tjr -->|"run records, measurements"| pg
  dockerd -->|"pull, build from the git ref, push"| ghcr
  agent -->|"model calls"| llm
```

- **There is one connection.**
  - Your machine sends one submission, receives one stream of state, and forwards each signal.
  - Every Docker call is local to the Fly machine.
- **#327 is unchanged.**
  - The thin client's Interrupts forwards each press, and the remote Interrupts aborts `windDown` or `forceQuit`.
- **Postgres is reached from the runtime machine**, as the architecture plan decides.
- **Images are built from a git ref.**
  - No build contexts are uploaded from your machine.
  - This assumes every code state can be built from a commit.
- **This is what the runner was for**, rebuilt on `runNext` instead of the old path.
- **Open question: what happens when your machine disconnects?**
  - Does the execution wind down, or carry on?
  - If it carries on, following it again (`run --follow <id>`) replaces `attach`.
