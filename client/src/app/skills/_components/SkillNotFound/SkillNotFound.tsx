"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";
import { routes } from "@/lib/routes";

/** Empty state for a skill id the API doesn't know (deleted skill, stale link). */
export function SkillNotFound() {
  const t = useTranslations("skills");
  const router = useRouter();
  return (
    <EmptyState
      icon="Sparkles"
      title={t("detail.notFound.title")}
      body={t("detail.notFound.body")}
      cta={t("detail.notFound.cta")}
      onCta={() => router.push(routes.skills())}
    />
  );
}
