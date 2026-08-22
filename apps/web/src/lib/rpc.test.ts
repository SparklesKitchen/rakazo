import { describe, expect, it } from "vitest";
import { workMateRpcUrl } from "./rpc.js";

describe("WorkMate Rakazo RPC URL", () => {
  it("keeps browser RPC traffic inside the authenticated SaaS Admin proxy path", () => {
    expect(workMateRpcUrl({ origin: "https://app.workmateos.co.uk", pathname: "/saas-admin/rakazo/app" }))
      .toBe("https://app.workmateos.co.uk/saas-admin/rakazo/rpc");
  });
});
