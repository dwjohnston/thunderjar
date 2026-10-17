# 4. Make `run` build, then run

See [../PLAN.md](../PLAN.md), "Product changes".

## What to do

- Today `run` runs each agent on the host (`createHostRunner`, `src/commands/run/run.ts`) and only looks up prerun images.
- Build any missing prerun image the way `build` does, reusing its code.
- Run each iteration in a container from its prerun image, leaving a postrun image.
- Tag both kinds of image with `--image-prefix` (task 2).

## Done when

A real `run` produces prerun images, postrun images and the run data store.
