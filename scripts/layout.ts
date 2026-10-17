// The folder structure of src/ and test/, as data. scripts/sync-oxlint-layout.ts turns it
// into oxlint rules and checks that every file sits in a folder listed here.
//
// Each entry covers the files directly inside its folder, never those in subfolders, so no
// two entries match the same file. Imports within a folder are always allowed.

export type FilenameCase = "kebabCase" | "camelCase" | "snakeCase" | "pascalCase";

export type LayoutEntry = {
  /** Globs matched against the names of files directly inside the folder. */
  allowedFiles: string[];
  /** Other layout folders this folder's files may import from. */
  mayImport?: string[];
  /** Defaults to kebabCase. */
  filenameCase?: FilenameCase;
};

export type Layout = Record<string, LayoutEntry>;

/**
 * src/'s layers, lowest first. Each may import any layer before it, never one after: see
 * src/AGENTS.md.
 */
export const LAYERS = [
  "src/api",
  "src/instruments",
  "src/project",
  "src/matrix",
  "src/store",
  "src/running",
  "src/images",
  "src/measuring",
] as const;

/** One folder per command under src/commands/, holding the command and its tests. */
export const COMMANDS = ["build", "executions", "generate", "init", "plan", "run", "show"] as const;

/** What every layer may use besides the layers below it: the real seams, and test helpers. */
const SHARED = ["src/adapters/docker", "src/testing"];

const commandFolders = COMMANDS.map((command) => `src/commands/${command}`);

export const layout: Layout = {
  // The package entry: re-exports src/api.
  src: { allowedFiles: ["*.ts", "AGENTS.md"], mayImport: ["src/api"] },
  ...Object.fromEntries(
    LAYERS.map((layer, i) => [layer, { allowedFiles: ["*.ts"], mayImport: [...LAYERS.slice(0, i), ...SHARED] }]),
  ),
  // format.ts, shared by the commands, and tests across commands. Commands' tests may use
  // another command to produce data, so command folders may import each other.
  "src/commands": { allowedFiles: ["*.ts"], mayImport: [...LAYERS, ...SHARED, ...commandFolders] },
  ...Object.fromEntries(
    commandFolders.map((folder) => [
      folder,
      { allowedFiles: ["*.ts"], mayImport: [...LAYERS, ...SHARED, "src/commands", ...commandFolders] },
    ]),
  ),
  "src/cli": { allowedFiles: ["*.ts"], mayImport: commandFolders },
  // The real implementations of the seams tests swap out. They depend on nothing else in src.
  "src/adapters/docker": { allowedFiles: ["*.ts"] },
  // Test helpers: fixture projects, the seed repository, the fake docker.
  "src/testing": { allowedFiles: ["*.ts"], mayImport: [...LAYERS, "src/adapters/docker"] },
};
