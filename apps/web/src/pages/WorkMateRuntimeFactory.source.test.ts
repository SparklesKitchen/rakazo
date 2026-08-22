import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(fileURLToPath(new URL("../App.tsx", import.meta.url)), "utf8");
const rpcSource = readFileSync(fileURLToPath(new URL("../lib/rpc.ts", import.meta.url)), "utf8");
const handoffSource = readFileSync(fileURLToPath(new URL("../lib/workmate-handoff.ts", import.meta.url)), "utf8");

describe("WorkMate Rakazo application contract", () => {
  it("opens the existing Rakazo Shell rather than a custom WorkMate runtime editor", () => {
    expect(appSource).toContain("<ShellPage />");
    expect(appSource).not.toContain("WorkMateAdminPage");
  });

  it("uses the short-lived WorkMate handoff only as Rakazo RPC authentication", () => {
    expect(rpcSource).toContain("Authorization");
    expect(handoffSource).toContain("workmate-rakazo-assertion");
  });
});
