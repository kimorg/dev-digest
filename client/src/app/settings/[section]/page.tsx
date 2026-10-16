import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SETTINGS_SECTIONS } from "@devdigest/ui/nav";
import { SettingsView } from "./_components/SettingsView";

export const metadata: Metadata = { title: "Settings" };

/* Route: /settings/:section. Thin route entry — the view, its section panels,
   styles, constants and i18n are colocated under _components/SettingsView.
   An unknown section is a 404, not a silent fallback to the first one. */
export default async function SettingsPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!SETTINGS_SECTIONS.some((s) => s.key === section)) notFound();
  return <SettingsView />;
}
