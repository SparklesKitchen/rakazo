import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(fileURLToPath(new URL("./app.ts", import.meta.url)), "utf8");

describe("WorkMate Rakazo admin contract", () => {
  it("does not expose a second, fabricated specialist catalogue from Rakazo", () => {
    expect(source).not.toContain("WORKMATE_SPECIALIST_CATALOGUE");
    expect(source).not.toContain("/api/workmate/admin/catalogue");
  });
});
