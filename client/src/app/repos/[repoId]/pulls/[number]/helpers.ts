/* Helpers shared by the PR-detail components (/repos/:repoId/pulls/:number). */
import type { LogLine } from "@devdigest/ui";

interface RawRunEvent {
  t: string;
  kind: string;
  msg: string;
}

/** Map run-bus events to the LiveLogStream LogLine shape. */
export function eventsToLog(events: RawRunEvent[]): LogLine[] {
  return events.map((e) => ({ t: e.t, k: e.kind as LogLine["k"], m: e.msg }));
}
