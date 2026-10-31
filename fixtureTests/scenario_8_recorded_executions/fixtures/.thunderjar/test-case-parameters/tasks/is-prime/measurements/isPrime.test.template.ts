import { {{defaultExport}} } from "{{subjectPath}}";

test("2 is prime", () => expect({{defaultExport}}(2)).toBe(true));
test("17 is prime", () => expect({{defaultExport}}(17)).toBe(true));
test("15 is not prime", () => expect({{defaultExport}}(15)).toBe(false));
test("0 is not prime", () => expect({{defaultExport}}(0)).toBe(false));
test("1 is not prime", () => expect({{defaultExport}}(1)).toBe(false));
