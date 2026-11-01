---
"thunderjar": patch
---

`thunderjar build <test case>` now builds the prerun Docker image of each permutation, unless it already exists. Permutations with the same hash share one image. It prints `Building <image> ... done` for each image it builds, then how many it built and how many were already present.
