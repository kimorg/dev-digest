import { redirect } from "next/navigation";
import { SETTINGS_SECTIONS } from "@devdigest/ui/nav";
import { routes } from "@/lib/routes";

/* Route: /settings — no index screen; open the first section. */
export default function SettingsIndexPage() {
  redirect(routes.settings(SETTINGS_SECTIONS[0].key));
}
