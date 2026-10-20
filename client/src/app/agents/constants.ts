/** Constants shared across the agents screens (/agents, /agents/:id). */
import type { Provider } from "@devdigest/shared";

/** Providers an agent can run on (create form + Config tab). */
export const PROVIDER_OPTIONS: readonly Provider[] = ["openai", "anthropic", "openrouter"];
