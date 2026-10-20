import type { CSSProperties } from "react";

/** Strip native <button> chrome so a clickable header/row can be a real button
    (keyboard + screen readers) while keeping its own layout styles. Spread it
    first, then the element's styles. */
export const UNSTYLED_BUTTON: CSSProperties = {
  background: "none",
  border: "none",
  margin: 0,
  padding: 0,
  font: "inherit",
  color: "inherit",
  textAlign: "left",
  cursor: "pointer",
  width: "100%",
};
