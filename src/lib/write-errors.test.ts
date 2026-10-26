import { beforeEach, describe, expect, test, vi } from "vitest";

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...args: unknown[]) => toastError(...args) } }));

const { reportingFailure } = await import("./write-errors");

beforeEach(() => toastError.mockClear());

describe("reportingFailure", () => {
  test("reportingFailure_shows_the_reason_and_still_fails_so_the_change_rolls_back", async () => {
    // Regression guarded: a write GitHub refused rolled back with no message, so a
    // repo dropped out of a List or reappeared after an unstar for no visible reason.
    const refused = new Error("Couldn't add the repo to the List on GitHub: That List no longer exists on GitHub.");

    await expect(reportingFailure(() => Promise.reject(refused))).rejects.toBe(refused);

    expect(toastError).toHaveBeenCalledWith(refused.message, { id: refused.message });
  });

  test("reportingFailure_shows_one_toast_for_a_bulk_action_that_fails_the_same_way_each_time", async () => {
    const failing = () => reportingFailure(() => Promise.reject(new Error("GitHub is down")));

    await Promise.allSettled([failing(), failing(), failing()]);

    // Same id each time, which Sonner treats as one toast being updated.
    expect(new Set(toastError.mock.calls.map(([, options]) => options.id))).toEqual(new Set(["GitHub is down"]));
  });

  test("reportingFailure_stays_quiet_when_the_write_succeeds", async () => {
    await expect(reportingFailure(async () => 42)).resolves.toBe(42);

    expect(toastError).not.toHaveBeenCalled();
  });
});
