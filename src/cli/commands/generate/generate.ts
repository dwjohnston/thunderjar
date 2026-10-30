import { Command } from "commander";

export function createGenerateCommand(): Command {
  return new Command("generate")
    .description("Generate thunderjar output.")
    .action(() => {
      console.log("nothing here yet");
    });
}
