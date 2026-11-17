#!/usr/bin/env python3
"""
Claude Code -> Langfuse Stop hook.

Sends each finished turn of a Claude Code session to Langfuse as one trace,
grouped into a Langfuse session by Claude Code's session id.

Based on the hook script in Langfuse's Claude Code integration guide,
https://langfuse.com/integrations/developer-tools/claude-code, changed to follow
https://langfuse.com/docs/observability/best-practices:

- Stable names. Traces are `claude-code-turn`, generations `generate-response`,
  tools are named after the tool. Turn numbers go in metadata.
- Tools are siblings of the generation that requested them, under the turn.
- An assistant message is spread over several transcript rows with the same
  message id, one per content block. Rows are merged, not "latest wins".
- Thinking is kept on each generation when the transcript has it.
- Subagent transcripts are nested under the tool call that started them.
- Turns are grouped by the transcript's promptId, so messages injected mid-turn
  don't split a turn.

It does nothing unless LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are set, and
it never fails the session: every error exits 0.

Needs the Langfuse Python SDK 4.x: pip install "langfuse>=4.0,<5"
"""

import hashlib
import json
import logging
import os
import sys
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

if os.environ.get("TRACE_TO_LANGFUSE", "").lower() == "false":
    sys.exit(0)
if not os.environ.get("LANGFUSE_PUBLIC_KEY") or not os.environ.get("LANGFUSE_SECRET_KEY"):
    sys.exit(0)

try:
    from langfuse import Langfuse, propagate_attributes
    from opentelemetry import trace as otel_trace_api
except Exception:
    sys.exit(0)

STATE_DIR = Path(os.environ.get("CC_LANGFUSE_STATE_DIR") or (Path.home() / ".claude" / "state"))
LOG_FILE = STATE_DIR / "langfuse_hook.log"
STATE_FILE = STATE_DIR / "langfuse_state.json"
LOCK_FILE = STATE_DIR / "langfuse_state.lock"

DEBUG = os.environ.get("CC_LANGFUSE_DEBUG", "").lower() == "true"
try:
    MAX_CHARS = int(os.environ.get("CC_LANGFUSE_MAX_CHARS", "20000"))
except ValueError:
    MAX_CHARS = 20000

SUBAGENT_TOOLS = ("Agent", "Task")

# ----------------- Logging -----------------
_logger: Optional[logging.Logger] = None


def _get_logger() -> Optional[logging.Logger]:
    global _logger
    if _logger is not None:
        return _logger
    try:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        lg = logging.getLogger("langfuse_hook")
        lg.setLevel(logging.DEBUG if DEBUG else logging.INFO)
        if not lg.handlers:
            h = RotatingFileHandler(str(LOG_FILE), maxBytes=5_000_000, backupCount=3)
            h.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
            lg.addHandler(h)
        _logger = lg
        return _logger
    except Exception:
        return None


def debug(msg: str) -> None:
    if DEBUG and _get_logger() is not None:
        try:
            _get_logger().debug(msg)
        except Exception:
            pass


def info(msg: str) -> None:
    if _get_logger() is not None:
        try:
            _get_logger().info(msg)
        except Exception:
            pass


# ----------------- State locking (best-effort) -----------------
class FileLock:
    def __init__(self, path: Path, timeout_s: float = 2.0):
        self.path = path
        self.timeout_s = timeout_s
        self._fh = None

    def __enter__(self):
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        self._fh = open(self.path, "a+", encoding="utf-8")
        try:
            import fcntl
        except ImportError:
            return self
        deadline = time.time() + self.timeout_s
        try:
            while True:
                try:
                    fcntl.flock(self._fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                    return self
                except BlockingIOError:
                    if time.time() > deadline:
                        raise TimeoutError(f"could not acquire {self.path}")
                    time.sleep(0.05)
        except BaseException:
            self._fh.close()
            raise

    def __exit__(self, exc_type, exc, tb):
        try:
            import fcntl

            fcntl.flock(self._fh.fileno(), fcntl.LOCK_UN)
        except Exception:
            pass
        try:
            self._fh.close()
        except Exception:
            pass


def load_state() -> Dict[str, Any]:
    try:
        if STATE_FILE.exists():
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {}


def save_state(state: Dict[str, Any]) -> None:
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(days=30)
        for k in list(state.keys()):
            updated = (state.get(k) or {}).get("updated")
            try:
                if updated and datetime.fromisoformat(updated) < cutoff:
                    del state[k]
            except Exception:
                continue
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        tmp = STATE_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(state, indent=2, sort_keys=True), encoding="utf-8")
        os.replace(tmp, STATE_FILE)
    except Exception as e:
        debug(f"save_state failed: {e}")


def state_key(session_id: str, transcript_path: str) -> str:
    return hashlib.sha256(f"{session_id}::{transcript_path}".encode("utf-8")).hexdigest()


# ----------------- Transcript helpers -----------------
def get_message(row: Dict[str, Any]) -> Dict[str, Any]:
    m = row.get("message")
    return m if isinstance(m, dict) else {}


def get_content(row: Dict[str, Any]) -> Any:
    m = get_message(row)
    return m.get("content") if m else row.get("content")


def get_role(row: Dict[str, Any]) -> Optional[str]:
    t = row.get("type")
    if t in ("user", "assistant"):
        return t
    r = get_message(row).get("role")
    return r if r in ("user", "assistant") else None


def blocks(content: Any, kind: str) -> List[Dict[str, Any]]:
    if not isinstance(content, list):
        return []
    return [b for b in content if isinstance(b, dict) and b.get("type") == kind]


def is_tool_result(row: Dict[str, Any]) -> bool:
    return get_role(row) == "user" and bool(blocks(get_content(row), "tool_result"))


def extract_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    parts = [b.get("text", "") for b in blocks(content, "text")]
    return "\n".join(p for p in parts if p)


def extract_thinking(content: Any) -> str:
    parts = [b.get("thinking", "") for b in blocks(content, "thinking")]
    return "\n".join(p for p in parts if p)


def truncate(s: Optional[str]) -> Tuple[str, Dict[str, Any]]:
    if not s:
        return "", {"truncated": False, "orig_len": 0}
    if len(s) <= MAX_CHARS:
        return s, {"truncated": False, "orig_len": len(s)}
    return s[:MAX_CHARS], {
        "truncated": True,
        "orig_len": len(s),
        "kept_len": MAX_CHARS,
        "sha256": hashlib.sha256(s.encode("utf-8")).hexdigest(),
    }


def to_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list) and all(isinstance(b, dict) for b in value):
        text = extract_text(value)
        if text or not value:
            return text
    return json.dumps(value, ensure_ascii=False)


def get_usage(msg: Dict[str, Any]) -> Optional[Dict[str, int]]:
    u = msg.get("usage")
    if not isinstance(u, dict):
        return None
    details: Dict[str, int] = {}
    for src, dst in (
        ("input_tokens", "input"),
        ("output_tokens", "output"),
        ("cache_read_input_tokens", "cache_read_input_tokens"),
        ("cache_creation_input_tokens", "cache_creation_input_tokens"),
    ):
        v = u.get(src)
        if isinstance(v, int) and v > 0:
            details[dst] = v
    return details or None


def parse_ts(value: Any) -> Optional[datetime]:
    if isinstance(value, dict):
        value = value.get("timestamp")
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None


@dataclass
class Row:
    data: Dict[str, Any]
    start: int  # byte offset of this line in the transcript


def read_rows(path: Path, offset: int = 0) -> Tuple[List[Row], int]:
    """Reads complete JSON lines from offset. Returns rows and the offset after the last complete line."""
    rows: List[Row] = []
    try:
        size = path.stat().st_size
        if size < offset:
            offset = 0
        with open(path, "rb") as f:
            f.seek(offset)
            chunk = f.read()
    except Exception as e:
        debug(f"read_rows failed: {e}")
        return rows, offset
    pos = offset
    for line in chunk.split(b"\n")[:-1]:
        start = pos
        pos += len(line) + 1
        if not line.strip():
            continue
        try:
            rows.append(Row(json.loads(line.decode("utf-8", errors="replace")), start))
        except Exception:
            continue
    return rows, pos


# ----------------- Turn assembly -----------------
@dataclass
class Assistant:
    message: Dict[str, Any]
    content: List[Dict[str, Any]]
    ts: Optional[datetime]
    end_ts: Optional[datetime]


@dataclass
class Turn:
    user_row: Dict[str, Any]
    start: int
    # Assistant messages in order, each with the user rows that followed it
    # (tool results and messages injected mid-turn).
    steps: List[Assistant] = field(default_factory=list)
    tool_results: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    injected: Dict[int, List[str]] = field(default_factory=dict)


def build_turns(rows: List[Row], main_transcript: bool = True) -> List[Turn]:
    turns: List[Turn] = []
    current: Optional[Turn] = None
    by_id: Dict[str, Assistant] = {}
    for row in rows:
        d = row.data
        if main_transcript and d.get("isSidechain"):
            continue
        role = get_role(d)
        if role is None:
            continue
        if is_tool_result(d):
            if current is None:
                continue
            for tr in blocks(get_content(d), "tool_result"):
                tid = tr.get("tool_use_id")
                if tid:
                    current.tool_results[str(tid)] = {
                        "content": tr.get("content"),
                        "is_error": bool(tr.get("is_error")),
                        "timestamp": d.get("timestamp"),
                        "tool_use_result": d.get("toolUseResult"),
                    }
            continue
        if role == "user":
            prompt_id = d.get("promptId")
            if current is not None and prompt_id and prompt_id == current.user_row.get("promptId"):
                text = extract_text(get_content(d))
                if text:
                    current.injected.setdefault(len(current.steps), []).append(text)
                continue
            current = Turn(user_row=d, start=row.start)
            turns.append(current)
            by_id = {}
            continue
        if current is None:
            continue
        msg = get_message(d)
        mid = msg.get("id") or f"noid:{len(current.steps)}"
        ts = parse_ts(d)
        content = get_content(d)
        content = content if isinstance(content, list) else [{"type": "text", "text": str(content or "")}]
        if mid in by_id:
            step = by_id[mid]
            step.content.extend(content)
            step.message = msg  # later rows carry the final usage
            step.end_ts = ts or step.end_ts
        else:
            step = Assistant(message=msg, content=list(content), ts=ts, end_ts=ts)
            by_id[mid] = step
            current.steps.append(step)
    return [t for t in turns if t.steps]


def last_text(turn: Turn) -> str:
    """The turn's answer: the last assistant text. An interrupted turn can end on a tool call."""
    for step in reversed(turn.steps):
        text = extract_text(step.content)
        if text:
            return text
    return ""


# ----------------- Langfuse emit -----------------
def _ns(ts: Optional[datetime]) -> Optional[int]:
    return int(ts.timestamp() * 1_000_000_000) if ts else None


def _start(lf: Langfuse, *, name: str, as_type: str, start_time: Optional[datetime], parent: Any = None, **kw: Any) -> Any:
    """Starts an observation at a past time. Langfuse 4.x's start_observation has no start_time,
    so this uses the SDK's OTel tracer directly, as Langfuse's own Claude Code hook does."""
    if not hasattr(lf, "_otel_tracer") or not hasattr(lf, "_create_observation_from_otel_span"):
        raise RuntimeError("Langfuse SDK is not 4.x: pip install \"langfuse>=4.0,<5\"")
    if parent is not None:
        with otel_trace_api.use_span(parent._otel_span, end_on_exit=False):
            span = lf._otel_tracer.start_span(name=name, start_time=_ns(start_time))
    else:
        span = lf._otel_tracer.start_span(name=name, start_time=_ns(start_time))
    return lf._create_observation_from_otel_span(otel_span=span, as_type=as_type, **kw)


def tool_call(tu: Dict[str, Any]) -> Dict[str, Any]:
    args = tu.get("input")
    args_str = args if isinstance(args, str) else json.dumps(args, ensure_ascii=False)
    return {"id": tu.get("id"), "type": "function", "function": {"name": tu.get("name"), "arguments": truncate(args_str)[0]}}


def emit_steps(lf: Langfuse, parent: Any, turn: Turn, transcript_path: Path, first_input: List[Dict[str, Any]], depth: int) -> Optional[datetime]:
    """Emits each assistant message as a generation, followed by sibling tool observations.
    Returns the time the last step ended."""
    prev_ts = parse_ts(turn.user_row)
    next_input: List[Dict[str, Any]] = list(first_input)
    last_end = prev_ts
    for idx, step in enumerate(turn.steps):
        for text in turn.injected.get(idx, []):
            next_input.append({"role": "user", "content": truncate(text)[0]})
        text, text_meta = truncate(extract_text(step.content))
        thinking, _ = truncate(extract_thinking(step.content))
        tool_uses = blocks(step.content, "tool_use")
        output: Dict[str, Any] = {"role": "assistant", "content": text}
        if tool_uses:
            output["tool_calls"] = [tool_call(tu) for tu in tool_uses]
        if thinking:
            output["thinking"] = thinking
        kw: Dict[str, Any] = dict(
            model=step.message.get("model") or "claude",
            input=next_input,
            output=output,
            metadata={
                "step_index": idx,
                "message_id": step.message.get("id"),
                "stop_reason": step.message.get("stop_reason"),
                "text": text_meta,
                "tool_count": len(tool_uses),
            },
        )
        usage = get_usage(step.message)
        if usage:
            kw["usage_details"] = usage
        gen = _start(lf, name="generate-response", as_type="generation", start_time=prev_ts or step.ts, parent=parent, **kw)
        gen.end(end_time=_ns(step.end_ts or step.ts or prev_ts))
        last_end = step.end_ts or step.ts or last_end

        next_input = []
        result_ts: List[datetime] = []
        for tu in tool_uses:
            tid = str(tu.get("id") or "")
            tname = tu.get("name") or "unknown"
            tr = turn.tool_results.get(tid) or {}
            out_text, out_meta = truncate(to_text(tr.get("content"))) if tr else ("", None)
            tr_ts = parse_ts(tr.get("timestamp")) if tr else None
            tool_input = tu.get("input")
            if isinstance(tool_input, str):
                tool_input = truncate(tool_input)[0]
            tool = _start(
                lf,
                name=tname,
                as_type="tool",
                start_time=step.end_ts or step.ts,
                parent=parent,
                input=tool_input,
                metadata={"tool_use_id": tid, "output": out_meta},
                level="ERROR" if tr.get("is_error") else None,
            )
            if tname in SUBAGENT_TOOLS:
                emit_subagent(lf, tool, tr.get("tool_use_result"), tid, transcript_path, depth)
            tool.update(output=out_text)
            tool.end(end_time=_ns(tr_ts or step.end_ts or step.ts))
            if tr_ts:
                result_ts.append(tr_ts)
            next_input.append({"role": "tool", "tool_call_id": tid, "content": out_text})
        if result_ts:
            prev_ts = max(result_ts)
            last_end = max([last_end] + result_ts) if last_end else prev_ts
        elif step.end_ts or step.ts:
            prev_ts = step.end_ts or step.ts
    return last_end


def find_subagent_transcript(tool_use_result: Any, tool_use_id: str, transcript_path: Path) -> Optional[Path]:
    """Subagent transcripts live in <session>/subagents/agent-<agentId>.jsonl, beside a .meta.json
    that names the tool call that started them."""
    session_dir = transcript_path.parent / transcript_path.stem
    if transcript_path.parent.name == "subagents":
        session_dir = transcript_path.parent.parent
    sub_dir = session_dir / "subagents"
    agent_id = tool_use_result.get("agentId") if isinstance(tool_use_result, dict) else None
    if agent_id:
        p = sub_dir / f"agent-{agent_id}.jsonl"
        if p.exists():
            return p
    try:
        for meta in sub_dir.glob("agent-*.meta.json"):
            if json.loads(meta.read_text(encoding="utf-8")).get("toolUseId") == tool_use_id:
                p = meta.with_name(meta.name.replace(".meta.json", ".jsonl"))
                if p.exists():
                    return p
    except Exception:
        pass
    return None


def emit_subagent(lf: Langfuse, tool: Any, tool_use_result: Any, tool_use_id: str, transcript_path: Path, depth: int) -> None:
    if depth >= 3:
        return
    try:
        path = find_subagent_transcript(tool_use_result, tool_use_id, transcript_path)
        if path is None:
            return
        rows, _ = read_rows(path)
        sub_turns = build_turns(rows, main_transcript=False)
        if not sub_turns:
            return
        meta: Dict[str, Any] = {}
        try:
            meta = json.loads(path.with_name(path.name.replace(".jsonl", ".meta.json")).read_text(encoding="utf-8"))
        except Exception:
            pass
        first = sub_turns[0]
        prompt, _ = truncate(extract_text(get_content(first.user_row)))
        agent = _start(
            lf,
            name="run-subagent",
            as_type="agent",
            start_time=parse_ts(first.user_row),
            parent=tool,
            input=prompt,
            metadata={"agent_type": meta.get("agentType"), "agent_id": path.stem.replace("agent-", ""), "transcript_path": str(path)},
        )
        end = None
        for t in sub_turns:
            end = emit_steps(lf, agent, t, path, [{"role": "user", "content": truncate(extract_text(get_content(t.user_row)))[0]}], depth + 1) or end
        final = last_text(sub_turns[-1])
        agent.update(output=truncate(final)[0])
        agent.end(end_time=_ns(end or parse_ts(first.user_row)))
    except Exception as e:
        info(f"emit_subagent failed: {type(e).__name__}: {e}")


def emit_turn(lf: Langfuse, session_id: str, turn_num: int, turn: Turn, transcript_path: Path) -> None:
    user_text, user_meta = truncate(extract_text(get_content(turn.user_row)))
    final_text, _ = truncate(last_text(turn))
    user_ts = parse_ts(turn.user_row)
    attrs: Dict[str, Any] = dict(session_id=session_id, trace_name="claude-code-turn", tags=["claude-code"])
    if os.environ.get("CC_LANGFUSE_USER_ID"):
        attrs["user_id"] = os.environ["CC_LANGFUSE_USER_ID"]
    with propagate_attributes(**attrs):
        root = _start(
            lf,
            name="claude-code-turn",
            as_type="agent",
            start_time=user_ts,
            input=user_text,
            metadata={
                "turn_number": turn_num,
                "prompt_id": turn.user_row.get("promptId"),
                "cwd": turn.user_row.get("cwd"),
                "git_branch": turn.user_row.get("gitBranch"),
                "claude_code_version": turn.user_row.get("version"),
                "transcript_path": str(transcript_path),
                "user_text": user_meta,
                "step_count": len(turn.steps),
            },
        )
        end = emit_steps(lf, root, turn, transcript_path, [{"role": "user", "content": user_text}], depth=0)
        root.update(output=final_text)
        root.end(end_time=_ns(end or user_ts))


# ----------------- Main -----------------
def read_payload() -> Dict[str, Any]:
    try:
        if sys.stdin.isatty():
            return {}
        data = sys.stdin.read()
        return json.loads(data) if data.strip() else {}
    except Exception as e:
        debug(f"read_payload: {e!r}")
        return {}


def main() -> int:
    started = time.time()
    payload = read_payload()
    session_id = payload.get("session_id") or payload.get("sessionId")
    transcript = payload.get("transcript_path") or payload.get("transcriptPath")
    if not session_id or not transcript:
        debug("payload has no session_id or transcript_path")
        return 0
    transcript_path = Path(transcript).expanduser()
    if not transcript_path.exists():
        return 0
    # On Stop the last turn is finished. Run any other way, the last turn may still be going,
    # so it is left for the next run.
    last_turn_done = payload.get("hook_event_name") == "Stop"

    lf = None
    try:
        lf = Langfuse(
            public_key=os.environ["LANGFUSE_PUBLIC_KEY"],
            secret_key=os.environ["LANGFUSE_SECRET_KEY"],
            base_url=os.environ.get("LANGFUSE_BASE_URL") or os.environ.get("LANGFUSE_HOST") or "https://cloud.langfuse.com",
            environment=os.environ.get("LANGFUSE_TRACING_ENVIRONMENT") or "development",
        )
    except Exception as e:
        info(f"Langfuse init failed: {e}")
        return 0

    emitted = 0
    try:
        with FileLock(LOCK_FILE):
            state = load_state()
            key = state_key(session_id, str(transcript_path))
            entry = state.get(key) or {}
            offset = int(entry.get("offset", 0))
            turn_count = int(entry.get("turn_count", 0))

            rows, end_offset = read_rows(transcript_path, offset)
            turns = build_turns(rows)
            if turns and not last_turn_done:
                end_offset = turns[-1].start
                turns = turns[:-1]
            for t in turns:
                turn_count += 1
                try:
                    emit_turn(lf, session_id, turn_count, t, transcript_path)
                    emitted += 1
                except Exception as e:
                    info(f"emit_turn failed: {type(e).__name__}: {e}")
            state[key] = {"offset": end_offset, "turn_count": turn_count, "updated": datetime.now(timezone.utc).isoformat()}
            save_state(state)
        info(f"Processed {emitted} turns in {time.time() - started:.2f}s (session={session_id})")
    except TimeoutError as e:
        debug(f"lock timeout: {e}")
    except Exception as e:
        info(f"unexpected failure: {type(e).__name__}: {e}")
    finally:
        # Cap flush at 30s so a slow or unreachable Langfuse can't stall Claude Code for long.
        # A normal turn flushes in well under a second. A long turn with many tool calls takes longer.
        def flush() -> None:
            try:
                lf.flush()
                lf.shutdown()
            except Exception:
                pass

        t = threading.Thread(target=flush, daemon=True)
        t.start()
        t.join(30.0)
    return 0


if __name__ == "__main__":
    sys.exit(main())
