/* Agent Skills tab — every skill of the workspace with a toggle to attach it
   to this agent. Linked skills come first in prompt order and can be dragged
   to reorder (that order is the order of the skill blocks in the prompt);
   the rest follow newest first. Every change saves the full ordered list at once. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills } from "@/lib/hooks/agents";
import { useSkills } from "@/lib/hooks/skills";
import { routes } from "@/lib/routes";
import { SkillRow } from "./_components/SkillRow";
import { SortableSkillRow } from "./_components/SortableSkillRow";
import { matchesName, moveLink, toAgentSkillRows, toggleLink } from "./helpers";
import { s } from "./styles";

/** Pointer travel before a press on the grip becomes a drag (keeps clicks clicks). */
const DRAG_ACTIVATION_PX = 4;

export interface SkillsTabProps {
  agent: Agent;
}

export function SkillsTab({ agent }: SkillsTabProps) {
  const t = useTranslations("agents");
  const router = useRouter();
  const skills = useSkills();
  const links = useAgentSkills(agent.id);
  const setLinks = useSetAgentSkills(agent.id);
  const [query, setQuery] = React.useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_PX } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (skills.isLoading || links.isLoading) return <Skeleton height={160} />;
  if (skills.isError || links.isError) {
    return (
      <ErrorState
        body={t("skills.loadError")}
        onRetry={() => {
          void skills.refetch();
          void links.refetch();
        }}
      />
    );
  }

  const all = skills.data ?? [];
  if (all.length === 0) {
    return (
      <EmptyState
        icon="Sparkles"
        title={t("skills.title")}
        body={t("skills.empty")}
        cta={t("skills.emptyCta")}
        onCta={() => router.push(routes.skills())}
      />
    );
  }

  const { linked, unlinked } = toAgentSkillRows(all, links.data ?? []);
  const linkedIds = linked.map((sk) => sk.id);
  // Reordering a filtered subset would hide where a row lands — drag only on the full list.
  const isFiltering = query.trim().length > 0;
  const visibleLinked = linked.filter((sk) => matchesName(sk, query));
  const visibleUnlinked = unlinked.filter((sk) => matchesName(sk, query));

  const toggle = (skillId: string) => (isOn: boolean) => setLinks.mutate(toggleLink(linkedIds, skillId, isOn));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const next = moveLink(linkedIds, String(active.id), String(over.id));
    if (next !== linkedIds) setLinks.mutate(next);
  };

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <span style={s.count}>{t("skills.enabledCount", { linked: linked.length, total: all.length })}</span>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("skills.filterPlaceholder")}
        aria-label={t("skills.filterPlaceholder")}
        style={s.filter}
      />
      {isFiltering && linked.length > 1 && <p style={s.filterNote}>{t("skills.filterDragHint")}</p>}

      <div style={s.list}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={linkedIds} strategy={verticalListSortingStrategy}>
            {visibleLinked.map((sk) => (
              <SortableSkillRow
                key={sk.id}
                skill={sk}
                position={linkedIds.indexOf(sk.id) + 1}
                isDragDisabled={isFiltering}
                onToggle={toggle(sk.id)}
              />
            ))}
          </SortableContext>
        </DndContext>
        {visibleUnlinked.map((sk) => (
          <SkillRow key={sk.id} skill={sk} onToggle={toggle(sk.id)} />
        ))}
        {visibleLinked.length + visibleUnlinked.length === 0 && (
          <div style={s.note}>{t("skills.noMatch", { q: query })}</div>
        )}
      </div>
    </div>
  );
}
