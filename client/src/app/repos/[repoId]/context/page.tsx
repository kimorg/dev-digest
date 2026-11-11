import type { Metadata } from "next";
import { ProjectContextView } from "./_components/ProjectContextView";

export const metadata: Metadata = { title: "Project Context" };

/* Route: /repos/:repoId/context — Workspace › Project Context (SPEC-005). Thin route entry. */
export default function ProjectContextPage() {
  return <ProjectContextView />;
}
