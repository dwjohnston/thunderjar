import { declareInitialPrompt } from "thunderjar";

// Tells the agent something, then, in the same session, asks for it back.
export default declareInitialPrompt({
  turns: ["My rubber ducky is called Eli.", "What is my rubber ducky called?"],
  timeoutSeconds: 60,
});
