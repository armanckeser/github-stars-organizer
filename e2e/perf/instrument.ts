// What the perf harness does inside the page. `seeded` and `instrument` run before the
// app's own scripts (page.addInitScript), so neither may close over anything outside itself.

/** One long animation frame (Chrome's Long Animation Frames API), and the scripts that ran in it. */
export type LongFrame = { start: number; duration: number; blocking: number; scripts: { source: string; invoker: string; duration: number }[] };

/** What a scenario recorded: every frame's start, the JavaScript its animation callbacks ran, the GPU time they asked for, React's commits, and the long frames. */
export type Recording = { frameStarts: number[]; frameWork: number[]; gpu: number[]; commits: number; longTasks: number[]; longFrames: LongFrame[] };

/** The page side of the harness. */
export type PerfProbe = { begin: () => void; end: () => Recording };

declare global {
  interface Window {
    stardPerf?: PerfProbe;
  }
}

type DevtoolsHook = {
  isDisabled: boolean;
  supportsFiber: boolean;
  renderers: Map<number, unknown>;
  inject: () => number;
  onCommitFiberRoot: () => void;
  onCommitFiberUnmount: () => void;
  onPostCommitFiberRoot: () => void;
  checkDCE: () => void;
};

type LongAnimationFrame = PerformanceEntry & { blockingDuration: number; scripts: (PerformanceEntry & { sourceURL: string; sourceFunctionName: string; invoker: string })[] };

/** Seeds the page's randomness with `seed`, so every run deals the same shops and meets the same opponents. */
export function seeded(seed: number) {
  // The run's seed, its shops and its opponents all come from crypto.getRandomValues, so a fixed sequence makes every run the same.
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
  Math.random = next;
  const getRandomValues = crypto.getRandomValues.bind(crypto);
  crypto.getRandomValues = <T extends ArrayBufferView<ArrayBuffer> | null>(array: T): T => {
    if (!(array instanceof Uint8Array)) return getRandomValues(array as ArrayBufferView<ArrayBuffer>) as T;
    for (let index = 0; index < array.length; index += 1) array[index] = Math.floor(next() * 256);
    return array;
  };
}

/** Starts counting. Recording runs between `begin` and `end`. */
export function instrument() {
  let recording = false;
  let frameStarts: number[] = [];
  let frameWork: number[] = [];
  let commits = 0;
  let longTasks: number[] = [];
  let longFrames: LongFrame[] = [];
  let gpu: number[] = [];

  // The GPU time of what each frame draws on the page's own canvas (the board), from timer queries; a card's or a medallion's canvas is never on the page.
  const contexts: WebGL2RenderingContext[] = [];
  const prototype = HTMLCanvasElement.prototype as unknown as { getContext: (this: HTMLCanvasElement, ...args: unknown[]) => unknown };
  const getContext = prototype.getContext;
  prototype.getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
    const context = getContext.apply(this, args);
    if (context instanceof WebGL2RenderingContext && !contexts.includes(context)) contexts.push(context);
    return context;
  };
  type Timer = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };
  const pending: { context: WebGL2RenderingContext; query: WebGLQuery }[] = [];
  const settle = () => {
    while (pending.length > 0) {
      const { context, query } = pending[0];
      if (!context.getQueryParameter(query, context.QUERY_RESULT_AVAILABLE)) return;
      pending.shift();
      const timer = context.getExtension("EXT_disjoint_timer_query_webgl2") as Timer | null;
      const disjoint = timer ? context.getParameter(timer.GPU_DISJOINT_EXT) : true;
      if (!disjoint && recording) gpu.push(context.getQueryParameter(query, context.QUERY_RESULT) / 1e6);
      context.deleteQuery(query);
    }
  };
  const boardContext = () => contexts.find((context) => context.canvas instanceof HTMLCanvasElement && context.canvas.isConnected && !context.isContextLost()) ?? null;

  // Every animation callback is timed; callbacks that share a frame's timestamp add up to that frame's work.
  const request = window.requestAnimationFrame.bind(window);
  let measuring = false;
  window.requestAnimationFrame = (callback) =>
    request((time) => {
      const context = recording ? boardContext() : null;
      const timer = context?.getExtension("EXT_disjoint_timer_query_webgl2") as Timer | null | undefined;
      // One query at a time per context: a second callback in the same frame is left out of it.
      const query = context && timer && !measuring ? context.createQuery() : null;
      if (context && timer && query) {
        context.beginQuery(timer.TIME_ELAPSED_EXT, query);
        measuring = true;
      }
      const started = performance.now();
      callback(time);
      if (context && timer && query) {
        context.endQuery(timer.TIME_ELAPSED_EXT);
        measuring = false;
        pending.push({ context, query });
      }
      settle();
      if (!recording) return;
      const spent = performance.now() - started;
      if (frameStarts.at(-1) === time) frameWork[frameWork.length - 1] += spent;
      else {
        frameStarts.push(time);
        frameWork.push(spent);
      }
    });

  // React calls a devtools hook on every commit, in production builds too.
  const hook: DevtoolsHook = {
    isDisabled: false,
    supportsFiber: true,
    renderers: new Map(),
    inject: () => 1,
    onCommitFiberRoot: () => {
      if (recording) commits += 1;
    },
    onCommitFiberUnmount: () => {},
    onPostCommitFiberRoot: () => {},
    checkDCE: () => {},
  };
  (window as unknown as { __REACT_DEVTOOLS_GLOBAL_HOOK__: DevtoolsHook }).__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook;

  new PerformanceObserver((list) => {
    if (recording) for (const entry of list.getEntries()) longTasks.push(entry.duration);
  }).observe({ type: "longtask" });
  new PerformanceObserver((list) => {
    if (!recording) return;
    for (const entry of list.getEntries() as LongAnimationFrame[]) {
      longFrames.push({
        start: entry.startTime,
        duration: entry.duration,
        blocking: entry.blockingDuration,
        scripts: entry.scripts.map((script) => ({ source: `${script.sourceFunctionName || "(anonymous)"} ${script.sourceURL.split("/").at(-1) ?? ""}`, invoker: script.invoker, duration: script.duration })),
      });
    }
  }).observe({ type: "long-animation-frame" });

  window.stardPerf = {
    begin: () => {
      frameStarts = [];
      frameWork = [];
      commits = 0;
      longTasks = [];
      longFrames = [];
      gpu = [];
      recording = true;
    },
    end: () => {
      recording = false;
      return { frameStarts, frameWork, gpu, commits, longTasks, longFrames };
    },
  };
}
