import { Command } from "commander";

export function createInitCommand(): Command {
  return new Command("init")
    .description("Initialise thunderjar in the current project.")
    .action(() => {
      console.log("nothing here yet");
    });
}
