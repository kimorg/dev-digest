import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import runs from "../../../../../../../../../../messages/en/runs.json";
import { PromptBlock } from "./PromptBlock";

afterEach(cleanup);

function renderBlock(props: Partial<React.ComponentProps<typeof PromptBlock>> = {}) {
  render(
    <NextIntlClientProvider locale="en" messages={{ runs }}>
      <PromptBlock label="Skills (dynamic)" text="<skill name=…>" color="red" {...props} />
    </NextIntlClientProvider>,
  );
}

describe("PromptBlock — tokens", () => {
  it("shows the block's token weight next to its label", () => {
    renderBlock({ tokens: 1234 });
    expect(screen.getByTestId("prompt-block-tokens")).toHaveTextContent("~1,234 tok");
  });

  it("shows no number for traces without token counts", () => {
    renderBlock({ tokens: undefined });
    expect(screen.queryByTestId("prompt-block-tokens")).not.toBeInTheDocument();
  });

  it("renders details above the text once expanded", () => {
    renderBlock({ details: <div>Uncovered Branches · v2</div> });
    expect(screen.queryByText("Uncovered Branches · v2")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Skills (dynamic)"));
    expect(screen.getByText("Uncovered Branches · v2")).toBeInTheDocument();
  });
});
