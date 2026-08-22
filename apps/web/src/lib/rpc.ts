import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import type { AppContract } from "@rakazo/contracts";
import { currentWorkMateAssertion } from "./workmate-handoff";

const link = new RPCLink({
  url: () =>
    typeof window === "undefined" ? "http://127.0.0.1:5173/rpc" : `${window.location.origin}/rpc`,
  fetch: (input, init) => {
    const request = new Request(input, init);
    const headers = new Headers(request.headers);
    const assertion = currentWorkMateAssertion();
    if (assertion) headers.set("Authorization", `Bearer ${assertion}`);
    return fetch(new Request(request, { headers, credentials: "include" }));
  },
});

export const rpc: ContractRouterClient<AppContract> = createORPCClient(link);
