import type { IconName } from "@devdigest/ui";

/** Skill detail tabs (`?tab=`). Label keys resolve under the `skills` namespace. */
export const SKILL_TABS: readonly { key: string; labelKey: string; icon: IconName }[] = [
  { key: "config", labelKey: "detail.tabs.config", icon: "Settings" },
  { key: "preview", labelKey: "detail.tabs.preview", icon: "Eye" },
  { key: "versions", labelKey: "detail.tabs.versions", icon: "History" },
];

export const SKILL_TAB_KEYS: readonly string[] = SKILL_TABS.map((tb) => tb.key);
