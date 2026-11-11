/** The last path segment: the downloaded file's name. */
export function baseName(path: string): string {
  return path.split("/").pop() || path;
}

/** Save `content` in the browser as `filename` (client-only Blob download). */
export function downloadText(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
