"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";
import { routes } from "@/lib/routes";

interface PrNotFoundProps {
  repoId: string;
  number: string;
}

/** Empty state for a PR number that isn't in the repo's synced list. No retry —
    the PR list already loaded, so asking again would return the same answer. */
export function PrNotFound({ repoId, number }: PrNotFoundProps) {
  const t = useTranslations("prReview");
  const router = useRouter();
  return (
    <EmptyState
      icon="GitPullRequest"
      title={t("notFound.title")}
      body={t("notFound.body", { number })}
      cta={t("notFound.cta")}
      onCta={() => router.push(routes.pulls(repoId))}
    />
  );
}
