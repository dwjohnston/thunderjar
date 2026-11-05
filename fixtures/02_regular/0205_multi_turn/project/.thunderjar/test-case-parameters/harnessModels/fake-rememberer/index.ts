import { declareHarness } from "thunderjar";

// A fake agent with a memory. Turn 0 starts a session, keeping what it was told in a file named
// after the session ID, and replies that it will remember it. Each later turn resumes the session,
// and replies with what it was told, or with nothing if the session isn't there.
export default declareHarness({
  version: "1.0.0",
  cli: (ctx) =>
    ctx.turn === 0
      ? `mkdir -p "$HOME/.fake-rememberer" && cp ${ctx.promptPath} "$HOME/.fake-rememberer/${ctx.sessionId}"` +
        ` && printf '{"reply":"I will remember that: %s"}' "$(cat ${ctx.promptPath})" > ${ctx.resultPath}`
      : `printf '{"reply":"You told me: %s"}' "$(cat "$HOME/.fake-rememberer/${ctx.sessionId}")" > ${ctx.resultPath}`,
  collectReply: (raw) => (JSON.parse(raw) as { reply: string }).reply,
});
