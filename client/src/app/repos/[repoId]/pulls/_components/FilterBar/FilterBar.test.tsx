import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/prReview.json";
import { FilterBar } from "./FilterBar";

afterEach(cleanup);

describe("FilterBar (smoke)", () => {
  it("reports status chip clicks and refresh", () => {
    const onActive = vi.fn();
    const onRefresh = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <FilterBar
          active="needs_review"
          onActive={onActive}
          query=""
          onQuery={() => {}}
          sort="newest"
          onSort={() => {}}
          onRefresh={onRefresh}
          refreshing={false}
        />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByText("All"));
    expect(onActive).toHaveBeenCalledWith("all");
    fireEvent.click(screen.getByText("Refresh"));
    expect(onRefresh).toHaveBeenCalled();
  });
});
