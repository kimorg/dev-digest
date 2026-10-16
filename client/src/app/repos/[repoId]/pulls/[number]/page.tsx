import type { Metadata } from "next";
import { Suspense } from "react";
import { PrDetailView } from "./_components/PrDetailView";

export const metadata: Metadata = { title: "Pull Request" };

/* Route: /repos/:repoId/pulls/:number (PR detail). Thin route entry — the view
   reads ?tab= / ?trace=, so it renders inside its own Suspense boundary. */
export default function PrDetailPage() {
  return (
    <Suspense fallback={null}>
      <PrDetailView />
    </Suspense>
  );
}
