import { describe, expect, it, vi } from "vitest";
import { pool } from "../src/db.js";

describe("db pool error handling", () => {
  it("does not crash the process when the pool emits an 'error' event", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      pool.emit("error", new Error("Connection terminated unexpectedly"));
    }).not.toThrow();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});
