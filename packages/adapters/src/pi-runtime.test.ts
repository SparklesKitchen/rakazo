import type { ConnectorTool } from "@rakazo/adapter-kit";
import { describe, expect, it, vi } from "vitest";
import { normalizeAgentToolName, normalizeAgentToolNames, PiAgentRuntime } from "./pi-runtime.js";

function tool(name: string): ConnectorTool {
  return { name, description: name, inputSchema: { type: "object" } };
}

describe("Pi agent runtime", () => {
  it("reports an unknown model without calling a provider", async () => {
    const runtime = new PiAgentRuntime();
    const events: string[] = [];
    for await (const event of runtime.run(
      {
        botId: "b",
        threadId: "t",
        runId: "r",
        prompt: "hi",
        instructions: "test",
        history: [],
        tools: [],
        model: { provider: "openrouter", id: "not-a-real-model-xyz" },
      },
      {
        operationId: "1",
        traceId: "1",
        workspaceId: "w",
        userId: "u",
        signal: new AbortController().signal,
      },
    )) {
      if (event.type === "text") events.push(event.text);
    }
    expect(events.join(" ")).toMatch(/Unknown model/i);
  });

  it("refuses direct provider credentials in WorkMate production mode", async () => {
    const runtime = new PiAgentRuntime({ workmateProduction: true });
    const events: string[] = [];
    for await (const event of runtime.run(
      {
        botId: "b",
        threadId: "t",
        runId: "r",
        prompt: "hi",
        instructions: "test",
        history: [],
        tools: [],
        model: { provider: "openrouter", id: "any", apiKey: "not-allowed" },
      },
      {
        operationId: "1",
        traceId: "1",
        workspaceId: "w",
        userId: "u",
        signal: new AbortController().signal,
      },
    )) {
      if (event.type === "text") events.push(event.text);
    }
    expect(events.join(" ")).toMatch(/WorkMate Router credentials are required/i);
  });

  it("sends production work only through the correlated WorkMate Router gateway", async () => {
    const gateway = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        authorization: "Bearer short-lived-workmate-assertion",
        "content-type": "application/json",
      });
      expect(JSON.parse(String(init?.body))).toEqual(expect.objectContaining({
        runId: "r",
        operationId: "1",
        traceId: "1",
        workspaceId: "w",
        prompt: "hi",
      }));
      return Response.json({
        ok: true,
        text: "Router-composed admin response",
        telemetry: { runId: "r", traceId: "1", modelRouteId: "rakazo-admin" },
      });
    });
    const runtime = new PiAgentRuntime({
      workmateProduction: true,
      workmateRouter: { executionUrl: "http://workmate-router.internal/execute", fetch: gateway as typeof fetch },
    });
    const events: Array<{ type: string; text?: string; provider?: string; model?: string }> = [];
    for await (const event of runtime.run(
      {
        botId: "b",
        threadId: "t",
        runId: "r",
        prompt: "hi",
        instructions: "Rakazo admin runtime",
        history: [],
        tools: [],
        model: { provider: "must-not-be-used", id: "must-not-be-used", workmateAssertion: "short-lived-workmate-assertion" },
      },
      { operationId: "1", traceId: "1", workspaceId: "w", userId: "u", signal: new AbortController().signal },
    )) events.push(event);
    expect(gateway).toHaveBeenCalledOnce();
    expect(events.filter((event) => event.type === "text").map((event) => event.text)).toEqual(["Router-composed admin response"]);
    expect(events.find((event) => event.type === "usage")).toMatchObject({ provider: "workmate-router", model: "rakazo-admin" });
  });

  it("fails closed when gateway output is missing or not correlated to the Rakazo run", async () => {
    const runtime = new PiAgentRuntime({
      workmateProduction: true,
      workmateRouter: {
        executionUrl: "http://workmate-router.internal/execute",
        fetch: (async () => Response.json({
          ok: true,
          text: "untrusted output",
          telemetry: { runId: "another-run", traceId: "1", modelRouteId: "route" },
        })) as typeof fetch,
      },
    });
    const events: string[] = [];
    for await (const event of runtime.run(
      {
        botId: "b",
        threadId: "t",
        runId: "r",
        prompt: "hi",
        instructions: "Rakazo admin runtime",
        history: [],
        tools: [],
        model: { provider: "must-not-be-used", id: "must-not-be-used", workmateAssertion: "short-lived-workmate-assertion" },
      },
      { operationId: "1", traceId: "1", workspaceId: "w", userId: "u", signal: new AbortController().signal },
    )) {
      if (event.type === "text") events.push(event.text);
    }
    expect(events.join(" ")).toMatch(/invalid production model output/i);
    expect(events.join(" ")).not.toContain("untrusted output");
  });
});

describe("Pi model-facing connector tool names", () => {
  it("leaves builtin-compatible names unchanged", () => {
    expect(normalizeAgentToolName("write_file")).toBe("write_file");
    expect(normalizeAgentToolNames([tool("write_file"), tool("shell")])).toEqual([
      "write_file",
      "shell",
    ]);
  });

  it("normalizes punctuation, whitespace, and Unicode to the provider-safe pattern", () => {
    const names = normalizeAgentToolNames([
      tool("destination.write"),
      tool("Google Calendar / criar evento"),
      tool("🦊"),
    ]);

    expect(names[0]).toBe("destination_write");
    expect(names[1]).toBe("Google_Calendar_criar_evento");
    expect(names[2]).toBe("connector_tool");
    expect(names.every((name) => /^[a-zA-Z0-9_-]+$/.test(name))).toBe(true);
  });

  it("limits long names to the provider's 64-character maximum", () => {
    const name = normalizeAgentToolName(`very-long-${"x".repeat(100)}`);

    expect(name).toHaveLength(64);
    expect(name).toMatch(/^[a-zA-Z0-9_-]+$/);
  });

  it("keeps normalized names unique and deterministic without shadowing valid names", () => {
    const tools = [tool("foo.bar"), tool("foo bar"), tool("foo_bar"), tool("🦊"), tool("🦊")];

    const first = normalizeAgentToolNames(tools);
    const second = normalizeAgentToolNames(tools);

    expect(second).toEqual(first);
    expect(new Set(first).size).toBe(tools.length);
    expect(first[2]).toBe("foo_bar");
    expect(first.every((name) => /^[a-zA-Z0-9_-]+$/.test(name))).toBe(true);
  });
});
