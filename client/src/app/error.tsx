"use client";

/* Route-level error boundary: an unexpected render error in any screen shows a
   retryable error state instead of Next's default error page. */
import { useTranslations } from "next-intl";
import { ErrorState } from "@devdigest/ui";

export default function RouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("common");
  return <ErrorState fullScreen title={t("routeError.title")} body={t("routeError.body")} onRetry={reset} />;
}
