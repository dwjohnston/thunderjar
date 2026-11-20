// A base image's `runOptions`: more `docker run` options for its agent containers.

const show = (value: unknown) => JSON.stringify(value) ?? String(value);

/** The options Thunderjar sets itself, which a base image can't. */
const RESERVED = ["--name", "--pull", "--entrypoint", "--rm", "--detach", "-d"];

/** Why `runOptions`, as loaded, isn't a list of `docker run` options Thunderjar can add, or undefined if it is one. */
export function runOptionsProblem(runOptions: unknown): string | undefined {
  if (runOptions === undefined) return undefined;
  if (!Array.isArray(runOptions) || runOptions.some((option) => typeof option !== "string")) {
    return `must be an array of docker run options and their values, each a string, got ${show(runOptions)}`;
  }
  const reserved = runOptions.filter((option: string) => RESERVED.includes(option.split("=")[0] as string));
  if (reserved.length > 0) return `${reserved.map(show).join(", ")} can't be given: Thunderjar sets ${reserved.length === 1 ? "it" : "them"} itself`;
  return undefined;
}
