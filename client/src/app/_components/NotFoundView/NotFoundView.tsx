"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { routes } from "@/lib/routes";

/** App-wide 404 (unknown URL or a route that calls notFound()), inside the shell. */
export function NotFoundView() {
  const t = useTranslations("common");
  const router = useRouter();
  return (
    <AppShell>
      <EmptyState
        icon="Search"
        title={t("notFound.title")}
        body={t("notFound.body")}
        cta={t("notFound.cta")}
        onCta={() => router.push(routes.home())}
      />
    </AppShell>
  );
}
