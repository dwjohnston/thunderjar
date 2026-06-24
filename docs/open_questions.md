# Open Questions

## What does `.construct()` return?

Currently resolved as: `.construct()` returns a `ThunderjarConfig` — the builder is a typed front-door to the same config shape the CLI already reads.

The alternative would be for `.construct()` to return a `ThunderJar` instance that the CLI works with directly, making `ThunderjarConfig` as a standalone type obsolete. Worth revisiting as the CLI evolves.
