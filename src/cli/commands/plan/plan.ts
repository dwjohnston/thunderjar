import { Command } from "commander";

export function createPlanCommand(): Command {
  return new Command("plan")
    .description("Plan thunderjar changes.")
    .action(() => {
      console.log("nothing here yet");
    });
}
