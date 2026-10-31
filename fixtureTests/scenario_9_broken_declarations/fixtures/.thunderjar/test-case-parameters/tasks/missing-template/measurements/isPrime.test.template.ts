import { {{defaultExport}} } from "{{subjectPath}}";

test("2 is prime", () => expect({{defaultExport}}(2)).toBe(true));
test("15 is not prime", () => expect({{defaultExport}}(15)).toBe(false));
