# Thunderjar: Ctrl+C flow

Nov 27, 2026 · @David Johnston

A first class `InterruptsService`  is provided.

This service is responsible for receiving SIGINTs and using these to emit Abort signals. \
\
There are two AbortSignals:

- windDown - the first ctrl+C
- forceQuit - the second ctrl+C

\
Future state: Presumably other parts of the application can emit a panic to also do graceful shut downs.

It's upto the other parts of the application to use these abort signals to gracefully (or ungracefully, in the case of the `forceQuit`)  finish their work.

## Interface

Interrupts turns each Ctrl+C into the next signal. It keeps the AbortControllers to itself, so other code can only read the signals.

```ts
interface Interrupts {
  windDown: AbortSignal;  // 1st Ctrl+C: finish what has started, start nothing new
  forceQuit: AbortSignal; // 2nd Ctrl+C: stop everything now
}
```

---

The sections below show the interactions as it relates to the `thunderjar run` command.

## Sequence

```mermaid
sequenceDiagram
  actor User
  participant OS as OS / terminal
  participant Intr as Interrupts
  participant Sched as Scheduler
  participant Perm as runPermutation
  participant UQ as UploadQueue
  participant State as RunStateStore
  participant Main as runCommand

  Note over OS,Intr: main builds Interrupts, which registers its own SIGINT handler

  User->>OS: Ctrl+C (1st)
  OS->>Intr: SIGINT
  Intr-->>Sched: windDown aborts
  Intr-->>Perm: windDown aborts
  Sched->>State: runs that never started = abandoned
  Perm->>Perm: before commit: remove container, no image
  Perm->>State: run = abandoned
  Note over Perm,UQ: Committed runs keep going: measurements are saved, images are uploaded
  State-->>User: "Stopping: 2 uploads left. Ctrl+C again to force quit."

  alt measurements and uploads finish
    UQ->>Main: drain() resolves
    Main-->>User: final frame, normal exit
  else User presses Ctrl+C (2nd)
    User->>OS: Ctrl+C
    OS->>Intr: SIGINT
    Intr-->>Perm: forceQuit aborts
    Intr-->>UQ: forceQuit aborts
    Perm->>Perm: kill measurement containers, results lost
    UQ->>UQ: cancel pushes, drain() resolves early
    Main-->>User: final frame, exit 130
  end
  Main->>Intr: dispose(): remove the SIGINT handler
```

## Service interactions

Solid arrows are the 1st Ctrl+C; dashed arrows are the 2nd.

```mermaid
flowchart LR
  term(["Terminal<br/>Ctrl+C"]) -->|SIGINT| intr["Interrupts"]
  main["main<br/>(composition root)"] -->|builds| intr

  intr -->|"windDown"| sched["Scheduler"]
  intr -->|"windDown"| perm["runPermutation"]
  intr -.->|"forceQuit"| perm
  intr -.->|"forceQuit"| uq["UploadQueue"]

  sched -->|"start nothing new"| state[("RunStateStore")]
  sched -->|"not-started runs: abandoned"| store[("runStore<br/>Postgres")]

  perm -->|"before commit:<br/>stop + remove agent container"| rt[("runtimeDocker")]
  perm -->|"abandoned record"| store
  perm -->|"status: abandoned"| state
  perm -->|"after commit:<br/>measurements still saved"| store
  perm -.->|"kill measurement container"| rt

  uq -->|"keeps pushing queued images"| rt
  uq -.->|"cancel pushes"| rt
  uq -->|"backlog left"| state

  state -->|"poll every 1s"| disp["Displayer"]
  disp -->|"Stopping: N uploads left.<br/>Ctrl+C again to force quit."| stdout(["stdout"])
```
