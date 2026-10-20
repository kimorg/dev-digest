"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";
import { routes } from "@/lib/routes";

/** Empty state for an agent id the API doesn't know (deleted agent, stale link). */
export function AgentNotFound() {
  const t = useTranslations("agents");
  const router = useRouter();
  return (
    <EmptyState
      icon="Cpu"
      title={t("notFound.title")}
      body={t("notFound.body")}
      cta={t("notFound.cta")}
      onCta={() => router.push(routes.agents())}
    />
  );
}
