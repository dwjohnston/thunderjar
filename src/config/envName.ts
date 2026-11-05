// What an environment variable's name may be. Its own module, imported by code the `view` app
// bundles, so it pulls in nothing else.

/** An environment variable's name, as a POSIX shell takes one. */
export const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
