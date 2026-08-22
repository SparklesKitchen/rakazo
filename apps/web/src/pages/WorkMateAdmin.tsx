import { useEffect, useState } from "react";

type Agent = { slug: string; name: string; capability: string };

export function WorkMateAdminPage() {
  const [state, setState] = useState<{ agents: Agent[]; error: string | null }>({ agents: [], error: null });
  useEffect(() => {
    const url = new URL(window.location.href);
    const handoff = url.searchParams.get("handoff");
    if (!handoff) return void setState({ agents: [], error: "Open Rakazo from WorkMate SaaS Admin." });
    url.searchParams.delete("handoff");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    void fetch("/saas-admin/rakazo/api/workmate/admin/catalogue", { headers: { authorization: `Bearer ${handoff}` }, credentials: "omit" })
      .then(async (response) => ({ response, body: await response.json() }))
      .then(({ response, body }) => setState(response.ok ? { agents: body.agents, error: null } : { agents: [], error: body.error ?? "Rakazo admin handoff was rejected." }))
      .catch(() => setState({ agents: [], error: "Rakazo admin is unavailable." }));
  }, []);
  if (state.error) return <main className="grid min-h-screen place-items-center bg-[#050506] text-[#e8e8ea]">{state.error}</main>;
  return <main className="min-h-screen bg-[#050506] px-8 py-10 text-[#e8e8ea]"><p className="text-sm text-[#9999a3]">WorkMate SaaS Admin</p><h1 className="mt-2 text-3xl font-semibold">Rakazo Runtime Factory</h1><p className="mt-2 text-[#b4b4bd]">Central specialist catalogue. Runtime execution stays under WorkMate authority.</p><section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{state.agents.map((agent) => <article className="rounded-xl border border-[#25252b] bg-[#101013] p-4" key={agent.slug}><h2 className="font-medium">{agent.name}</h2><p className="mt-1 text-sm text-[#9999a3]">{agent.capability}</p><p className="mt-3 text-xs text-[#6f6f78]">{agent.slug}</p></article>)}</section></main>;
}
