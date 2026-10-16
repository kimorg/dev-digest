/* Root — sends the user to the first repo's PR list, or onboarding if no repos. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Button, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/page-shell";
import { useRepos } from "@/lib/hooks/repos";
import { ApiError } from "@/lib/api";
import { routes } from "@/lib/routes";

export default function HomePage() {
  const t = useTranslations("home");
  const router = useRouter();
  const { data: repos, isLoading, isError, error, refetch } = useRepos();
  const first = repos?.[0];

  React.useEffect(() => {
    if (first) router.replace(routes.pulls(first.id));
  }, [first, router]);

  return (
    <AppShell crumb={[{ label: t("breadcrumb") }]}>
      <PageContainer title={t("title")} subtitle={t("subtitle")}>
        {isLoading || first ? (
          // Loading, or about to redirect to the first repo: show a skeleton with a
          // manual link in case the redirect is slow.
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 480 }}>
            <Skeleton height={20} width={240} />
            <Skeleton height={48} />
            {first && (
              <div>
                <p style={{ color: "var(--text-secondary)", margin: "8px 0 14px" }}>{t("redirecting")}</p>
                <Button kind="primary" onClick={() => router.push(routes.pulls(first.id))}>
                  {t("openRepo", { name: first.full_name })}
                </Button>
              </div>
            )}
          </div>
        ) : isError ? (
          // An API outage is not "no repositories" — don't send the user to add one.
          <ErrorState
            title={t("loadErrorTitle")}
            body={error instanceof ApiError ? error.message : t("loadErrorBody")}
            onRetry={() => refetch()}
          />
        ) : (
          <EmptyState
            icon="GitBranch"
            title={t("emptyTitle")}
            body={t("emptyBody")}
            cta={t("emptyCta")}
            onCta={() => router.push(routes.onboarding())}
          />
        )}
      </PageContainer>
    </AppShell>
  );
}
