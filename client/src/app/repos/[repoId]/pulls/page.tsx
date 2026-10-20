import type { Metadata } from "next";
import { Suspense } from "react";
import { PullsListView } from "./_components/PullsListView";

export const metadata: Metadata = { title: "Pull Requests" };

/* Route: /repos/:repoId/pulls (PR list). Thin route entry — the view reads
   ?status=, so it renders inside its own Suspense boundary. */
export default function PullsPage() {
  return (
    <Suspense fallback={null}>
      <PullsListView />
    </Suspense>
  );
}
