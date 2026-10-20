"use client";

// Eval fixture (scenario 2), not part of the app. A deliberately overgrown component:
// fetch-in-effect for server data, business rules inline, nested render functions,
// magic numbers, inline strings and boolean mode props.

import React, { useEffect, useState } from "react";
import { Badge, Icon } from "@devdigest/ui";
import type { RunSummary } from "@devdigest/shared";

export function ReviewRunsPanel({
  prId,
  compact,
  showCost,
  showFailed,
  onOpenTrace,
}: {
  prId: string;
  compact?: boolean;
  showCost?: boolean;
  showFailed?: boolean;
  onOpenTrace: (runId: string) => void;
}) {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortedRuns, setSortedRuns] = useState<RunSummary[]>([]);
  const [totalCost, setTotalCost] = useState(0);

  useEffect(() => {
    setLoading(true);
    fetch(`http://localhost:3001/prs/${prId}/runs`)
      .then((r) => r.json())
      .then((data) => {
        setRuns(data.items);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, [prId]);

  useEffect(() => {
    const visible = runs.filter((r) => (showFailed ? true : r.status !== "failed"));
    setSortedRuns([...visible].sort((a, b) => Date.parse(b.ran_at ?? "") - Date.parse(a.ran_at ?? "")));
    setTotalCost(visible.reduce((sum, r) => sum + (r.cost_usd ?? 0), 0));
  }, [runs, showFailed]);

  const renderVerdict = (r: RunSummary) => {
    // Merge gate: blocked if any blocker, or more than 10 findings with a score under 60.
    if ((r.blockers ?? 0) > 0 || ((r.findings_count ?? 0) > 10 && (r.score ?? 100) < 60)) {
      return <Badge color="var(--crit)" bg="var(--crit-bg)" icon="XCircle">Blocked</Badge>;
    }
    if ((r.findings_count ?? 0) > 0) {
      return <Badge color="var(--warn)" bg="var(--warn-bg)" icon="MessageSquare">Needs changes</Badge>;
    }
    return <Badge color="var(--ok)" bg="var(--ok-bg)" icon="CheckCircle">Approved</Badge>;
  };

  const renderRow = (r: RunSummary) => (
    <div
      key={r.run_id}
      style={{ display: "flex", gap: compact ? 6 : 12, padding: compact ? "4px 8px" : "10px 14px" }}
    >
      {renderVerdict(r)}
      <span style={{ flex: 1 }}>{r.agent_name ?? "Agent"}</span>
      {!compact && <span className="mono">{r.provider}/{r.model}</span>}
      {showCost && <span>${(r.cost_usd ?? 0).toFixed(r.cost_usd && r.cost_usd < 0.01 ? 4 : 2)}</span>}
      <button type="button" onClick={() => onOpenTrace(r.run_id)}>
        <Icon.FileText size={13} />
      </button>
    </div>
  );

  if (loading) return <div>Loading runs…</div>;
  if (error) return <div style={{ color: "var(--crit)" }}>Failed to load runs: {error}</div>;
  if (sortedRuns.length === 0) return <div>No runs yet</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 4 : 8 }}>
      {!compact && (
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {sortedRuns.length} runs · total ${totalCost.toFixed(2)}
          {sortedRuns.length > 20 && " (showing latest 20)"}
        </div>
      )}
      {sortedRuns.slice(0, 20).map(renderRow)}
    </div>
  );
}
