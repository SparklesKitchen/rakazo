import { useEffect, useMemo, useState } from "react";

type ModelConfig = { providerPlanSlug: string; model: string; reasoningEffort: string; accessRoute: string; spendLane: string };
type ToolPermission = { toolId: string; label?: string; permissionMode: string; state: string; externalMutation?: boolean };
type RuntimeAgent = {
  agent: { slug: string; name: string; capabilityLabel: string; defaultExecutionMode: string; backgroundExecution: boolean };
  modelConfig: ModelConfig;
  toolPermissions: ToolPermission[];
  approvalRules: Array<{ id?: string; label?: string; trigger?: string; action?: string }>;
};

const handoffStorageKey = "workmate-rakazo-admin-door";
const permissionModes = ["ask-every-time", "draft-for-review", "auto-run-within-approved-boundaries", "auto-run-except-sensitive", "never-do-this-action"];

function tenantFromHandoff(handoff: string) {
  try { return JSON.parse(atob((handoff.split(".")[0] ?? "").replace(/-/g, "+").replace(/_/g, "/"))).tenantId as string; }
  catch { return ""; }
}

export function WorkMateAdminPage() {
  const handoff = useMemo(() => new URLSearchParams(window.location.search).get("handoff") ?? "", []);
  const tenantId = useMemo(() => handoff ? tenantFromHandoff(handoff) : sessionStorage.getItem(handoffStorageKey) ?? "", [handoff]);
  const [agents, setAgents] = useState<RuntimeAgent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<RuntimeAgent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!tenantId) return void setError("Open Rakazo from WorkMate SaaS Admin.");
    if (handoff) {
      sessionStorage.setItem(handoffStorageKey, tenantId);
      window.history.replaceState({}, "", window.location.pathname);
    }
    void fetch(`/api/admin/rakazo/runtime?tenantId=${encodeURIComponent(tenantId)}`, { credentials: "include" })
      .then(async (response) => ({ response, body: await response.json() }))
      .then(({ response, body }) => {
        if (!response.ok || !body?.agents) throw new Error(body?.error ?? "Runtime unavailable");
        setAgents(body.agents); setSelectedAgent(body.agents[0] ?? null);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Runtime unavailable"));
  }, [handoff, tenantId]);

  async function saveRuntime() {
    if (!selectedAgent) return;
    setSaving(true); setSaved(false); setError(null);
    try {
      const response = await fetch(`/api/admin/rakazo/runtime/${selectedAgent.agent.slug}/model`, {
        method: "PUT", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId, modelConfig: selectedAgent.modelConfig }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Runtime save failed");
      setSaved(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Runtime save failed"); }
    finally { setSaving(false); }
  }

  async function saveTool(tool: ToolPermission, permissionMode: string) {
    if (!selectedAgent) return;
    setSaving(true); setSaved(false); setError(null);
    try {
      const response = await fetch(`/api/admin/rakazo/runtime/${selectedAgent.agent.slug}/tools/${tool.toolId}`, {
        method: "PUT", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId, permissionMode }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Tool permission save failed");
      const next = { ...selectedAgent, toolPermissions: selectedAgent.toolPermissions.map((item) => item.toolId === tool.toolId ? { ...item, permissionMode } : item) };
      setSelectedAgent(next); setAgents((all) => all.map((item) => item.agent.slug === next.agent.slug ? next : item)); setSaved(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Tool permission save failed"); }
    finally { setSaving(false); }
  }

  if (error) return <main className="grid min-h-screen place-items-center bg-[#050506] text-[#e8e8ea]">{error}</main>;
  return <main className="min-h-screen bg-[#050506] p-8 text-[#e8e8ea]">
    <p className="text-sm text-[#9999a3]">WorkMate SaaS Admin · Rakazo Runtime Factory</p>
    <h1 className="mt-2 text-3xl font-semibold">Existing WorkMate agents</h1>
    <p className="mt-2 text-[#b4b4bd]">Choose an existing WorkMate. These controls change the runtime used for customer work.</p>
    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_460px]">
      <section className="grid gap-3 sm:grid-cols-2">{agents.map((item) => <button type="button" onClick={() => { setSelectedAgent(item); setSaved(false); }} className={`rounded-xl border p-4 text-left ${selectedAgent?.agent.slug === item.agent.slug ? "border-cyan-400 bg-cyan-400/10" : "border-[#25252b] bg-[#101013]"}`} key={item.agent.slug}><h2 className="font-medium">{item.agent.name}</h2><p className="mt-1 text-sm text-[#9999a3]">{item.agent.capabilityLabel}</p><p className="mt-3 text-xs text-[#6f6f78]">{item.modelConfig.model} · {item.agent.defaultExecutionMode}</p></button>)}</section>
      {selectedAgent && <aside className="rounded-xl border border-[#25252b] bg-[#101013] p-5"><h2 className="text-xl font-semibold">{selectedAgent.agent.name} runtime</h2><label className="mt-5 block text-sm">Model<input value={selectedAgent.modelConfig.model} onChange={(event) => setSelectedAgent({ ...selectedAgent, modelConfig: { ...selectedAgent.modelConfig, model: event.target.value } })} className="mt-2 w-full rounded border border-[#35353c] bg-black px-3 py-2" /></label><label className="mt-4 block text-sm">Reasoning effort<select value={selectedAgent.modelConfig.reasoningEffort} onChange={(event) => setSelectedAgent({ ...selectedAgent, modelConfig: { ...selectedAgent.modelConfig, reasoningEffort: event.target.value } })} className="mt-2 w-full rounded border border-[#35353c] bg-black px-3 py-2"><option value="minimal">minimal</option><option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="xhigh">xhigh</option></select></label><h3 className="mt-6 text-sm font-medium">Tools and approval boundaries</h3><div className="mt-3 space-y-3">{selectedAgent.toolPermissions.map((tool) => <div className="rounded border border-[#2a2a30] p-3" key={tool.toolId}><p className="text-sm">{tool.label ?? tool.toolId}</p><label className="mt-2 block text-xs text-[#9999a3]">Permission mode<select aria-label="Permission mode" disabled={saving} value={tool.permissionMode} onChange={(event) => void saveTool(tool, event.target.value)} className="mt-1 w-full rounded border border-[#35353c] bg-black px-2 py-1.5 text-sm text-[#e8e8ea]">{permissionModes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select></label></div>)}</div><h3 className="mt-6 text-sm font-medium">Fixed approval rules</h3><ul className="mt-2 space-y-1 text-sm text-[#9999a3]">{selectedAgent.approvalRules.map((rule) => <li key={rule.id ?? rule.label}>{rule.label ?? rule.trigger} · {rule.action}</li>)}</ul><button type="button" disabled={saving} onClick={saveRuntime} className="mt-6 rounded bg-cyan-400 px-4 py-2 font-medium text-black disabled:opacity-50">{saving ? "Saving…" : "Save runtime"}</button>{saved && <p className="mt-3 text-sm text-emerald-300">Saved to the live WorkMate runtime.</p>}</aside>}
    </div>
  </main>;
}
