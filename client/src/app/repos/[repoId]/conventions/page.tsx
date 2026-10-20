import type { Metadata } from "next";
import { ConventionsView } from "./_components/ConventionsView";

export const metadata: Metadata = { title: "Conventions" };

/* Route: /repos/:repoId/conventions — Skills Lab › Conventions (L02). Thin route entry. */
export default function ConventionsPage() {
  return <ConventionsView />;
}
