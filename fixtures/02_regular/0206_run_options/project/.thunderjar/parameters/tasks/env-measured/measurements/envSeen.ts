/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLjTC1bzhycPs8knbmL
 * Supervising engineer: Claude
 *
 *
 * Humans: add your notes here
 *
 *
 */
import { declareMeasurement } from "thunderjar";

// What the measurement container sees of the run's variables: the test case's env's value, which
// isn't secret, and whether its secretEnv and the harness's requiredEnv are set and not blank,
// `set` or nothing, never their values: a shell measurement's stdout is stored.
export default declareMeasurement({
  instrument: "shell",
  config: {
    command: 'echo "setting ${FAKE_TEST_CASE_SETTING:-unset}, secret ${FAKE_TEST_CASE_SECRET:+set}, key ${FAKE_HARNESS_KEY:+set}"',
  },
  metrics: { exited0: { stat: "rate" } },
});
