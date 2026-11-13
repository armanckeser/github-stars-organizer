import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Darkroom } from "./darkroom";

// The darkroom on a canvas fake: the canvas is where the browser boundary is (toBlob),
// and every picture's "drawing" is a log line, so the order and the count of studios
// are what the tests read.

/** How long the darkroom keeps its studio after the last picture (darkroom.ts). */
const KEPT_FOR = 1500;

/** A studio whose canvas holds the name of the last picture drawn on it. */
type Fake = { renderer: { domElement: Pick<HTMLCanvasElement, "toBlob"> }; serial: number; draw: (what: string) => void };

function lab() {
  const log: string[] = [];
  let studios = 0;
  const open = (): Fake => {
    studios += 1;
    const serial = studios;
    log.push(`open studio ${serial}`);
    // The canvas hands back what was last drawn on it, as a canvas copies its pixels.
    let drawn = "";
    const domElement: Pick<HTMLCanvasElement, "toBlob"> = { toBlob: (done) => done(new Blob([drawn])) };
    return { renderer: { domElement }, serial, draw: (what) => (drawn = what) };
  };
  const close = (studio: Fake) => log.push(`close studio ${studio.serial}`);
  const darkroom = new Darkroom(open, close);
  /** A picture whose drawing waits a compile of `compileMs`, if any, before it renders `name`. */
  const ask = (name: string, compileMs = 0) =>
    darkroom.picture(name, async (studio) => {
      log.push(`start ${name}`);
      if (compileMs > 0) await new Promise((resolve) => setTimeout(resolve, compileMs));
      studio.draw(name);
      log.push(`end ${name}`);
    });
  return { darkroom, log, ask };
}

const contentOf = async (url: string) => (await fetch(url)).text();


describe("the darkroom", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  // Regression guarded: a boost pick made a renderer, a room and its shaders for each of
  // its three medallions (214-238 ms on a 4x-throttled phone).
  test("darkroom_opens_one_studio_when_three_pictures_are_asked_together", async () => {
    const { log, ask } = lab();
    const pictures = Promise.all([ask("troy"), ask("abed"), ask("annie")]);
    await vi.runAllTimersAsync();
    await pictures;
    expect(log.filter((line) => line.startsWith("open"))).toEqual(["open studio 1"]);
  });

  // Regression guarded: two pictures on one shared renderer interleave, so the second's
  // creature is drawn into the first's scene while the first waits for its shaders.
  test("darkroom_draws_each_picture_whole_when_the_first_waits_for_its_shaders", async () => {
    const { log, ask } = lab();
    const pictures = Promise.all([ask("troy", 40), ask("abed")]);
    await vi.runAllTimersAsync();
    const [troy, abed] = await pictures;
    expect(log.filter((line) => !line.startsWith("open"))).toEqual(["start troy", "end troy", "start abed", "end abed", "close studio 1"]);
    expect([await contentOf(troy), await contentOf(abed)]).toEqual(["troy", "abed"]);
  });

  // Regression guarded: the shop drew its five cards back to back in one task, which
  // held the board's frame for 68-182 ms on a 4x-throttled phone.
  test("darkroom_waits_a_task_before_each_picture_when_several_are_asked", async () => {
    vi.useRealTimers();
    const { darkroom, log, ask } = lab();
    // A task queued as the first picture is drawn: it runs before the second only if the second waits for a task of its own.
    const troy = darkroom.picture("troy", async (studio) => {
      log.push("start troy");
      studio.draw("troy");
      setTimeout(() => log.push("a frame of the board"));
      log.push("end troy");
    });
    await Promise.all([troy, ask("abed")]);
    expect(log).toEqual(["open studio 1", "start troy", "end troy", "a frame of the board", "start abed", "end abed"]);
  });

  // Regression guarded: a page of cards holding a WebGL context open after its pictures are drawn.
  test("darkroom_lets_its_studio_go_when_no_picture_is_asked_for_a_while", async () => {
    const { log, ask } = lab();
    const first = ask("troy");
    await vi.advanceTimersByTimeAsync(0);
    await first;
    await vi.advanceTimersByTimeAsync(KEPT_FOR - 1);
    expect(log).not.toContain("close studio 1");
    await vi.advanceTimersByTimeAsync(1);
    expect(log).toContain("close studio 1");
    const second = ask("abed");
    await vi.runAllTimersAsync();
    await second;
    expect(log.filter((line) => line.startsWith("open"))).toEqual(["open studio 1", "open studio 2"]);
  });

  test("darkroom_draws_a_picture_once_when_it_is_asked_for_twice", async () => {
    const { log, ask } = lab();
    const pictures = Promise.all([ask("troy"), ask("troy")]);
    await vi.runAllTimersAsync();
    const [first, second] = await pictures;
    expect(first).toBe(second);
    expect(log.filter((line) => line.startsWith("start"))).toEqual(["start troy"]);
  });

  test("darkroom_draws_a_failed_picture_afresh_and_the_next_one_still_when_a_drawing_throws", async () => {
    const { darkroom, log, ask } = lab();
    let attempts = 0;
    const broken = () =>
      darkroom.picture("chang", async () => {
        attempts += 1;
        throw new Error("No WebGL in Greendale's library.");
      });
    const failure = (picture: Promise<string>) => picture.then(() => "drawn", (error: Error) => error.message);
    const failed = failure(broken());
    const after = ask("abed");
    await vi.runAllTimersAsync();
    expect(await failed).toBe("No WebGL in Greendale's library.");
    expect(await contentOf(await after)).toBe("abed");
    const again = failure(broken());
    await vi.runAllTimersAsync();
    expect(await again).toBe("No WebGL in Greendale's library.");
    expect(attempts).toBe(2);
    expect(log).toContain("end abed");
  });
});
