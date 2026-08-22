import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./WorkMateAdmin.tsx", import.meta.url)),
  "utf8",
);

describe("WorkMate Rakazo runtime factory contract", () => {
  it("loads the actual preset WorkMate runtime rather than a fabricated catalogue", () => {
    expect(source).toContain("/api/admin/rakazo/runtime");
    expect(source).not.toContain("type Agent =");
    expect(source).not.toContain("admin/catalogue");
  });

  it("opens a selected agent's live runtime controls and saves its model and tool permissions", () => {
    expect(source).toContain("selectedAgent");
    expect(source).toContain("/api/admin/rakazo/runtime/${selectedAgent.agent.slug}/model");
    expect(source).toContain("/api/admin/rakazo/runtime/${selectedAgent.agent.slug}/tools/${tool.toolId}");
    expect(source).toContain("Permission mode");
    expect(source).toContain("Save runtime");
  });
});
