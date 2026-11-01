---
"thunderjar": patch
---

`thunderjar run <test case>` now runs the test case. It builds any missing prerun image, then runs each iteration of each permutation in a Docker container from its prerun image, inside an execution wrapper that records when the agent started and finished and how it exited, and commits the container into its postrun image. It prints a line for each iteration as it finishes, then where it wrote the results. Each execution, and each container run with the agent's result file, is recorded in the run data store: JSON files under `.thunderjar/.data/runs/<execution ID>/`, or under `--data-dir <dir>`. An agent exiting non-zero is recorded and the rest still run, but `run` exits 1.
