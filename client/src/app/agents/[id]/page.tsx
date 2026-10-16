import type { Metadata } from "next";
import { Suspense } from "react";
import { AgentEditorView } from "./_components/AgentEditorView";

export const metadata: Metadata = { title: "Agent" };

/* Route: /agents/:id (Agent Editor). Thin route entry — the view reads ?tab=,
   so it renders inside its own Suspense boundary. */
export default function AgentEditorPage() {
  return (
    <Suspense fallback={null}>
      <AgentEditorView />
    </Suspense>
  );
}
