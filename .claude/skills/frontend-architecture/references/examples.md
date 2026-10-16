# Examples: bad → good refactors

## Contents
- 1. God component → api hook + model + view
- 2. Helper promoted on the second consumer
- 3. Constants: magic values → named, colocated
- 4. Cross-feature import → composition at the route
- 5. Effect-driven logic → render and handlers
- 6. Barrel removal

## 1. God component → api hook + model + view

Before: one component fetches, maps, applies rules and renders.

```tsx
// features/reviews/components/RunList.tsx
export function RunList({ prId }: { prId: string }) {
  const [runs, setRuns] = useState<Run[]>([]);
  useEffect(() => {
    fetch(`/api/prs/${prId}/runs`).then(r => r.json()).then(data =>
      setRuns(data.map((d: any) => ({ ...d, cost: d.cost_cents / 100 }))));
  }, [prId]);

  return runs
    .filter(r => r.status !== "cancelled" && (r.findings.length > 0 || r.cost > 0.5))
    .map(r => <div key={r.id}>{r.status === "failed" ? "❌" : "✅"} ${r.cost.toFixed(2)}</div>);
}
```

After: each concern has its own place.

```ts
// features/reviews/api/runs.ts: gateway + server cache
const runKeys = { all: ["runs"] as const, byPr: (prId: string) => [...runKeys.all, prId] as const };

async function getRuns(prId: string): Promise<Run[]> {
  const data = await apiClient.get(`/prs/${prId}/runs`, RunsResponseSchema);
  return data.map(toRun); // API → domain mapping lives here
}

export function useRuns(prId: string) {
  return useQuery({ queryKey: runKeys.byPr(prId), queryFn: () => getRuns(prId) });
}
```

```ts
// features/reviews/model/runs.ts: business rules, no React
export const MIN_NOTABLE_COST = 0.5;

export function isNotableRun(run: Run): boolean {
  return run.status !== "cancelled" && (run.findings.length > 0 || run.cost > MIN_NOTABLE_COST);
}
```

```tsx
// features/reviews/components/RunList/RunList.tsx: view
export function RunList({ prId }: RunListProps) {
  const { data: runs = [] } = useRuns(prId);
  return runs.filter(isNotableRun).map(run => <RunRow key={run.id} run={run} />);
}
```

## 2. Helper promoted on the second consumer

- Day 1: `formatDuration(ms)` is used only by `RunRow`, so it goes in `RunRow/RunRow.helpers.ts`.
- Day 5: `TraceTimeline` (same feature) needs it, so move it to `features/reviews/helpers.ts`.
- Day 9: the `repos` feature needs it too. It is domain-free, so it is a util and goes to `utils/time.ts`.
- Each move updates the imports and deletes the old copy. It never jumps straight to `utils/` on day 1
  "because it might be reused".

## 3. Constants: magic values → named, colocated

```tsx
// before
if (comments.length > 50) …
<Pagination pageSize={25} />

// after: RunList/RunList.constants.ts (used only by RunList and its helpers)
export const MAX_COMMENTS_PER_FILE = 50;
export const RUNS_PAGE_SIZE = 25;
```

If `RUNS_PAGE_SIZE` must match the server, it belongs in the shared API contract or `config/`, not in
the component folder.

## 4. Cross-feature import → composition at the route

```tsx
// before: features/reviews imports from features/repos
import { RepoBadge } from "@/features/repos/components/RepoBadge";
```

```tsx
// after: the route composes both; reviews accepts a slot
// app/repos/[repoId]/pulls/[number]/page.tsx
<ReviewHeader repoBadge={<RepoBadge repoId={repoId} />} pr={pr} />
```

If many features need `RepoBadge` and it has no repo-specific behaviour, move it to shared `components/`.

## 5. Effect-driven logic → render and handlers

```tsx
// before
const [visible, setVisible] = useState<Finding[]>([]);
useEffect(() => setVisible(findings.filter(f => f.severity >= minSeverity)), [findings, minSeverity]);
useEffect(() => { if (saved) toast("Saved"); }, [saved]);

// after
const visible = filterBySeverity(findings, minSeverity);   // derived in render (model fn)
async function handleSave() { await save(); toast("Saved"); } // caused by user → handler
```

## 6. Barrel removal

```ts
// before: features/reviews/index.ts
export * from "./components/RunList";
export * from "./components/RunRow";
export * from "./model/runs";
export * from "./api/runs";
// RunRow.tsx: import { isNotableRun } from ".."   ← cycle through the barrel
```

```ts
// after: direct imports; if a public API is wanted, list it explicitly
// features/reviews/index.ts
export { RunList } from "./components/RunList/RunList";
export { useRuns } from "./api/runs";
// inside the feature: relative, direct
import { isNotableRun } from "../../model/runs";
```
