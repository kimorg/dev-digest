/** Constants for Settings → Feature Models. */
import type { Provider } from "@devdigest/shared";

/** Providers a system feature can run on (the provider picker of each row). */
export const FEATURE_PROVIDER_OPTIONS: readonly Provider[] = ["openai", "anthropic", "openrouter"];
