import type { Metadata } from "next";
import { Suspense } from "react";
import { SkillsView } from "./_components/SkillsView";

export const metadata: Metadata = { title: "Skills" };

/* Route: /skills (Skills Lab list, nothing selected). Thin route entry — the
   view reads ?tab=, so it renders inside its own Suspense boundary. */
export default function SkillsPage() {
  return (
    <Suspense fallback={null}>
      <SkillsView />
    </Suspense>
  );
}
