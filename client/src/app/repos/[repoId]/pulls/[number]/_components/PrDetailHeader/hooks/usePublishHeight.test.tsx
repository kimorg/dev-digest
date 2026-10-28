import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { usePublishHeight } from "./usePublishHeight";

afterEach(cleanup);

function Probe() {
  const ref = React.useRef<HTMLDivElement>(null);
  usePublishHeight(ref, "--probe-h");
  return <div ref={ref} data-testid="probe" />;
}

describe("usePublishHeight — CSS variable", () => {
  it("writes the element's height on its parent and removes it on unmount", () => {
    const view = render(<Probe />);
    const host = view.container;
    expect(host.style.getPropertyValue("--probe-h")).toBe("0px");
    view.unmount();
    expect(host.style.getPropertyValue("--probe-h")).toBe("");
  });
});
