import type { ContextDocument } from "@devdigest/shared";

/** Documents sorted by path (the server already sorts; this keeps the list stable regardless). */
export function sortByPath(documents: ContextDocument[]): ContextDocument[] {
  return [...documents].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
