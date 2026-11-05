import { declareInitialPrompt } from "thunderjar";

// Quotes, $, backticks, a backslash, % and a newline: each breaks a prompt pasted into a shell command.
export default declareInitialPrompt({
  prompt: `Say "hello", then print $HOME and \`whoami\`.
Don't stop at 'single quotes', a backslash \\ or 100%.`,
  timeoutSeconds: 600,
});
