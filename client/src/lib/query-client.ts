/* query-client.ts — the app's QueryClient factory (extracted from providers.tsx
   so the global error surfacing can be tested on its own). */
import { QueryClient, QueryCache, MutationCache } from "@tanstack/react-query";
import { notify } from "./toast";
import { ApiError } from "./api";

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
    // Global error surfacing (errors anywhere → toast). Mutations always
    // toast (they are user actions), unless the mutation sets `meta.silent`
    // because it shows its own inline error. Queries only toast on network/5xx —
    // expected 4xx like a 404 "no tour yet" stay silent for inline empty states.
    queryCache: new QueryCache({
      onError: (err) => {
        const status = err instanceof ApiError ? err.status : 500;
        if (status === 0 || status >= 500) notify.error(errorMessage(err));
      },
    }),
    mutationCache: new MutationCache({
      onError: (err, _vars, _ctx, mutation) => {
        if (mutation.meta?.silent === true) return;
        notify.error(errorMessage(err));
      },
    }),
  });
}
