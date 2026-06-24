# Operating Principles

## Prefer callbacks over static values

Throughout the builder API, configuration that could be a plain string is instead a callback returning a string. For example, `onWorktreeCreate`, harness `cli`, and measurer `evaluate` are all functions rather than raw values.

The reason: callbacks receive a context object. As the framework evolves, more values can be added to that context object and made available to callers without breaking existing configurations. A plain string can never be given new information; a callback always can.

This applies consistently across the API — when in doubt, make it a callback.
