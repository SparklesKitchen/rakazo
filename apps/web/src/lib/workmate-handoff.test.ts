import { describe, expect, it } from "vitest";
import { workMateAssertionStorageKey } from "./workmate-handoff";

describe("Rakazo WorkMate handoff", () => {
  it("uses a single short-lived assertion storage key for the authenticated application", () => {
    expect(workMateAssertionStorageKey).toBe("workmate-rakazo-assertion");
  });
});
