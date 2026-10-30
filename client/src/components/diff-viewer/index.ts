/* diff-viewer — unified-diff viewer with optional inline GitHub comments.
   Public surface: the DiffViewer component + the DiffCommentApi contract. */
export { DiffViewer } from "./DiffViewer";
export type { DiffCommentApi } from "./comments";
export { isAutoExpanded } from "./helpers";
export type { DiffAnnotation, DiffAnnotationApi, DiffFileOpenApi, DiffLineMark } from "./annotations";
