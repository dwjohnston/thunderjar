import { InvalidArgumentError, Option } from "commander";
import { DEFAULT_IMAGE_PREFIX, imagePrefixProblem } from "../execution/images.ts";

/** `--image-prefix <name>`: what every image name starts with, instead of `thunderjar`. */
export function imagePrefixOption(): Option {
  return new Option("--image-prefix <name>", "start every image name with <name>, e.g. <name>-prerun:<hash>, instead of thunderjar")
    .default(DEFAULT_IMAGE_PREFIX)
    .argParser((prefix: string) => {
      const problem = imagePrefixProblem(prefix);
      if (problem) throw new InvalidArgumentError(`It ${problem}`);
      return prefix;
    });
}
