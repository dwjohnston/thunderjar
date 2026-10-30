import { Command } from "commander";
import pkg from "../../package.json" with { type: "json" };

export function createProgram(): Command {
  const program = new Command()
    .name("thunderjar")
    .description(pkg.description)
    .version(pkg.version);

  program
    .command("init")
    .description("Initialise thunderjar in the current project.")
    .action(() => {
      console.log("nothing here yet");
    });

  return program;
}
