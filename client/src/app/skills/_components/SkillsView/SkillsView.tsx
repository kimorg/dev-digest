/* /skills and /skills/:id — Skills Lab (L02, client/specs/003-skills.md).
   Master-detail: the skill list stays on the left; the selected skill's
   Config / Preview / Versions open on the right. Tab state lives in ?tab=. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { SkillListItem } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useDeleteSkill, useSkill, useSkills, useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { routes } from "@/lib/routes";
import { AddSkillModal } from "../AddSkillModal";
import { SkillCard } from "../SkillCard";
import { SKILL_TAB_KEYS } from "../SkillDetail/constants";
import { SkillPane } from "./_components/SkillPane";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillsView() {
  const t = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const { id } = useParams<{ id?: string }>();
  const search = useSearchParams();

  const { data: skills, isLoading, isError, refetch } = useSkills();
  const detail = useSkill(id);
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  const [query, setQuery] = React.useState("");
  const [isAdding, setIsAdding] = React.useState(false);
  const [toDelete, setToDelete] = React.useState<SkillListItem | null>(null);

  const requested = search.get("tab") ?? "";
  const tab = SKILL_TAB_KEYS.includes(requested) ? requested : SKILL_TAB_KEYS[0]!;
  const setTab = (next: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", next);
    router.replace(routes.skill(id!, sp));
  };

  const list = filterSkills(skills ?? [], query);
  const selected = detail.data;

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: routes.skills() },
    ...(selected ? [{ label: selected.name }] : []),
  ];

  const onCreated = (skill: SkillListItem) => {
    setIsAdding(false);
    toast.success(
      skill.source === "imported_file"
        ? t("import.importedToast", { name: skill.name })
        : t("add.createdToast", { name: skill.name }),
    );
    router.push(routes.skill(skill.id));
  };

  const confirmDelete = () => {
    if (!toDelete) return;
    const { id: deletedId, name } = toDelete;
    del.mutate(deletedId, {
      onSuccess: () => {
        toast.success(t("delete.deletedToast", { name }));
        setToDelete(null);
        if (deletedId === id) router.replace(routes.skills());
      },
    });
  };

  return (
    <AppShell crumb={crumb}>
      {isAdding && <AddSkillModal onClose={() => setIsAdding(false)} onCreated={onCreated} />}
      {toDelete && (
        <ConfirmDialog
          title={t("delete.title")}
          message={
            <>
              {t("delete.body", { name: toDelete.name })} {t("delete.linked", { count: toDelete.agent_count })}
            </>
          }
          isPending={del.isPending}
          onConfirm={confirmDelete}
          onCancel={() => setToDelete(null)}
        />
      )}
      <div style={s.layout}>
        <div style={s.sidebar}>
          <div style={s.sidebarHead}>
            <div style={s.titleRow}>
              <h1 style={s.title}>{t("page.heading")}</h1>
              <Button kind="primary" size="sm" icon="Plus" onClick={() => setIsAdding(true)}>
                {t("page.addSkill")}
              </Button>
            </div>
            <div style={s.search}>
              <Icon.Search size={13} style={s.searchIcon} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("page.searchPlaceholder")}
                aria-label={t("page.searchPlaceholder")}
                style={s.searchInput}
              />
            </div>
          </div>
          <div style={s.list}>
            {isLoading && (
              <>
                <Skeleton height={96} />
                <Skeleton height={96} />
              </>
            )}
            {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
            {skills && skills.length > 0 && list.length === 0 && (
              <div style={s.listNote}>{t("page.noMatch", { q: query })}</div>
            )}
            {list.map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                isActive={sk.id === id}
                onSelect={() => router.push(routes.skill(sk.id, { tab }))}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
                onDelete={() => setToDelete(sk)}
              />
            ))}
          </div>
        </div>

        <div style={s.pane}>
          <SkillPane
            id={id}
            skill={selected}
            isLoading={detail.isLoading}
            error={detail.error}
            onRetry={() => detail.refetch()}
            isEmpty={skills?.length === 0}
            onAdd={() => setIsAdding(true)}
            tab={tab}
            onTab={setTab}
          />
        </div>
      </div>
    </AppShell>
  );
}
