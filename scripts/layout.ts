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

export const layout: Layout = {
  src: { allowedFiles: ["*.ts"], mayImport: ["src/adapters/docker", "src/commands", "src/testing"] },
  // The real implementations of the seams tests swap out. They depend on nothing else in src.
  "src/adapters/docker": { allowedFiles: ["*.ts"] },
  "src/cli": { allowedFiles: ["*.ts"], mayImport: ["src/commands"] },
  "src/commands": { allowedFiles: ["*.ts"], mayImport: ["src", "src/adapters/docker", "src/testing"] },
  "src/testing": { allowedFiles: ["*.ts"], mayImport: ["src", "src/adapters/docker"] },
};
