import { describe, it, expect } from "vitest";
import { ApiError, isNotFoundError } from "./api";

describe("isNotFoundError", () => {
  it("treats 404 and a malformed-id 422 as 'doesn't exist'", () => {
    expect(isNotFoundError(new ApiError("Agent not found", 404, "not_found"))).toBe(true);
    expect(isNotFoundError(new ApiError("Invalid uuid", 422, "validation_error"))).toBe(true);
  });

  it("keeps other failures retryable", () => {
    expect(isNotFoundError(new ApiError("boom", 500))).toBe(false);
    expect(isNotFoundError(new ApiError("API down", 0, "network_error"))).toBe(false);
    expect(isNotFoundError(new Error("x"))).toBe(false);
  });
});
