import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Markdown } from "./Markdown";

afterEach(cleanup);

describe("Markdown — safe rendering (AC-54, AC-55)", () => {
  it("shows raw HTML as text, not as markup", () => {
    const { container } = render(<Markdown>{"before <b>x</b> <script>alert(1)</script>"}</Markdown>);
    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container).toHaveTextContent("<b>x</b>");
  });

  it("keeps http, https, mailto and relative links clickable", () => {
    render(
      <Markdown>
        {"[a](https://example.com) [b](http://example.com) [c](mailto:a@b.co) [d](./docs/x.md) [e](#anchor)"}
      </Markdown>,
    );
    expect(screen.getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual([
      "https://example.com",
      "http://example.com",
      "mailto:a@b.co",
      "./docs/x.md",
      "#anchor",
    ]);
  });

  it("renders links with any other scheme as non-clickable text (javascript:, data:, mixed case)", () => {
    const { container } = render(
      <Markdown>{"[js](javascript:alert(1)) [data](data:text/html;base64,AAAA) [vb](vbscript:x) [mixed](JaVaScRiPt:alert(1))"}</Markdown>,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(container.querySelector("a")).toBeNull();
    expect(container).toHaveTextContent("js");
    expect(container).toHaveTextContent("mixed");
  });
});
