import type { Metadata } from "next";
import { Suspense } from "react";
import { SkillsView } from "../_components/SkillsView";

export const metadata: Metadata = { title: "Skill" };

/* Route: /skills/:id — the same master-detail view as /skills, with this skill
   open on the right (client/specs/003-skills.md). */
export default function SkillPage() {
  return (
    <Suspense fallback={null}>
      <SkillsView />
    </Suspense>
  );
}
