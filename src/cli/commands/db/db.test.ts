// `thunderjar db setup`, through the CLI. The Postgres tests run only with THUNDERJAR_POSTGRES_URL
// set to a Postgres they may create and drop schemas in.
import { afterEach, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { copyScenarioProject, thunderjar } from "../../../testing/cli.ts";
import { usePostgres } from "../run/runTestSupport.ts";

const POSTGRES_URL = Bun.env.THUNDERJAR_POSTGRES_URL;
const schemas: string[] = [];

/** A schema name, not yet created, dropped after the test. */
const freshSchema = () => {
  const schema = `tj_test_${crypto.randomUUID().replaceAll("-", "")}`;
  schemas.push(schema);
  return schema;
};

afterEach(async () => {
  if (!POSTGRES_URL) return;
  const admin = new SQL(POSTGRES_URL);
  for (const schema of schemas.splice(0)) await admin.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.close();
});

describe.skipIf(!POSTGRES_URL)("db setup with a postgresStore", () => {
  test("creates the schema and the store's tables with the admin URL", async () => {
    await using copy = await copyScenarioProject("0202");
    const schema = freshSchema();
    await usePostgres(copy.dir, schema);

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["db", "setup"], { env: { THUNDERJAR_DB_URL_ADMIN: POSTGRES_URL } });

    expect({ stdout, stderr, exitCode }).toEqual({
      stdout: `The run data store's tables are in the ${schema} schema of Postgres at $THUNDERJAR_DB_URL_ADMIN.\n`,
      stderr: "",
      exitCode: 0,
    });
    const admin = new SQL(POSTGRES_URL!);
    const tables = await admin`SELECT table_name FROM information_schema.tables WHERE table_schema = ${schema} ORDER BY 1`;
    await admin.close();
    expect(tables.map((row: { table_name: string }) => row.table_name)).toEqual(["thunderjar_container_runs", "thunderjar_executions"]);
  });
});
