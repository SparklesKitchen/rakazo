import type { Bot } from "@rakazo/contracts";
import { useEffect, useState } from "react";

type ModelConfig = { providerPlanSlug: string; model: string; reasoningEffort: string; accessRoute: string; spendLane: string };
type RuntimeAgent = { agent: { slug: string; name: string }; modelConfig: ModelConfig };

function agentSlug(bot: Bot) {
  const prefix = "WorkMate specialist runtime: ";
  return bot.description.startsWith(prefix) ? bot.description.slice(prefix.length).trim() : "";
}

export function WorkMateModelRouteOverlay({ bot, onClose }: { bot: Bot; onClose: () => void }) {
  const slug = agentSlug(bot);
  const [config, setConfig] = useState<ModelConfig | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!slug) return void setError("This Rakazo bot has no WorkMate runtime binding.");
    // WorkMate derives tenant and workspace from the authenticated SaaS Admin
    // session. A Rakazo workspace ID is never a tenant ID.
    void fetch("/api/admin/rakazo/runtime", { credentials: "include" })
      .then(async (response) => ({ response, body: await response.json() }))
      .then(({ response, body }) => {
        const agent = (body?.agents as RuntimeAgent[] | undefined)?.find((item) => item.agent.slug === slug);
        if (!response.ok || !agent) throw new Error(body?.error ?? "WorkMate runtime is unavailable.");
        setConfig(agent.modelConfig);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "WorkMate runtime is unavailable."));
  }, [bot.workspaceId, slug]);

  async function save() {
    if (!config || !slug) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/admin/rakazo/runtime/${slug}/model`, {
        method: "PUT", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ modelConfig: config }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Could not save WorkMate model route.");
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save WorkMate model route."); }
    finally { setSaving(false); }
  }

  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-5">
    <section className="w-full max-w-lg rounded-2xl border border-[#343438] bg-[#171719] p-6 text-[#ececee]">
      <p className="text-sm text-[#a2a2aa]">{bot.name} · WorkMate model route</p>
      <h2 className="mt-2 text-xl font-semibold">Runtime model</h2>
      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : !config ? <p className="mt-4 text-sm text-[#a2a2aa]">Loading route…</p> : <><label className="mt-5 block text-sm">Model<input value={config.model} onChange={(event) => setConfig({ ...config, model: event.target.value })} className="mt-2 w-full rounded border border-[#44444a] bg-[#09090a] px-3 py-2" /></label><label className="mt-4 block text-sm">Reasoning effort<select value={config.reasoningEffort} onChange={(event) => setConfig({ ...config, reasoningEffort: event.target.value })} className="mt-2 w-full rounded border border-[#44444a] bg-[#09090a] px-3 py-2"><option value="minimal">minimal</option><option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="xhigh">xhigh</option></select></label></>}
      <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded px-4 py-2 text-sm">Cancel</button><button type="button" disabled={!config || saving} onClick={() => void save()} className="rounded bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-50">{saving ? "Saving…" : "Save WorkMate route"}</button></div>
    </section>
  </div>;
}
