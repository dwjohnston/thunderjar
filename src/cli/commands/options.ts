// Options several commands share.

import { InvalidArgumentError, Option } from "commander";

/** An option that takes a value, may be given only once, and whose value isn't another flag. */
function valueOption(flags: string, description: string): Option {
  return new Option(flags, description).argParser((value: string, previous: string | undefined) => {
    if (previous !== undefined) throw new InvalidArgumentError("It may only be given once.");
    if (value.startsWith("-")) throw new InvalidArgumentError("It needs a value, not another flag.");
    return value;
  });
}

export const imagePrefixOption = (description: string) => valueOption("--image-prefix <name>", description);

export const dataDirOption = () =>
  valueOption("--data-dir <dir>", "keep the run data store in this folder, in place of .thunderjar/.data/");
