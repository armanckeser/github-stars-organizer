// Where the cards' and the boosts' pictures are drawn: one renderer, made for the first
// picture and let go a moment after the last, so a page of cards doesn't hold a WebGL
// context open. Each picture is its own task, its shaders are compiled off the main
// thread and its PNG is encoded off it too, so a shop of five cards or a pick of three
// medallions never holds a frame of the board for long.

/** How long the renderer is kept after the last picture, for the next ones a page asks for. */
const IDLE = 1500;

/** What a darkroom's pictures are drawn on (a three.js renderer, and whatever else it keeps between pictures): only its canvas is read here. */
export type Studio = { renderer: { domElement: Pick<HTMLCanvasElement, "toBlob"> } };

/** A PNG of the canvas as an object URL; the canvas is copied before this returns, the encoding comes later. */
function developed(canvas: Pick<HTMLCanvasElement, "toBlob">): Promise<string> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error("The picture could not be encoded."))), "image/png"));
}

/** Waits for a task of its own, so the browser can draw a frame first. */
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve));

export class Darkroom<Kept extends Studio> {
  private studio: Kept | null = null;
  private closing: ReturnType<typeof setTimeout> | undefined;
  /** The picture asked for last, which the next one waits for. */
  private last: Promise<unknown> = Promise.resolve();
  private readonly pictures = new Map<string, Promise<string>>();

  /** `open` makes the studio; `close` lets go of what it made, its renderer included. */
  constructor(
    private readonly open: () => Kept,
    private readonly close: (studio: Kept) => void,
  ) {}

  /**
   * The picture kept as `key`, or else drawn by `draw` once the pictures asked for before
   * it are: `draw` sets the studio's scene, renders it and clears it again. Rejects when
   * the browser has no WebGL; a picture that failed is drawn afresh when asked again.
   */
  picture(key: string, draw: (studio: Kept) => Promise<void>): Promise<string> {
    const kept = this.pictures.get(key);
    if (kept) return kept;
    const drawn = this.last.then(() => this.develop(draw));
    this.last = drawn.catch(() => undefined);
    this.pictures.set(key, drawn);
    drawn.catch(() => this.pictures.delete(key));
    return drawn;
  }

  private async develop(draw: (studio: Kept) => Promise<void>): Promise<string> {
    clearTimeout(this.closing);
    await nextTask();
    try {
      this.studio ??= this.open();
      await draw(this.studio);
      return await developed(this.studio.renderer.domElement);
    } finally {
      this.closing = setTimeout(() => this.letGo(), IDLE);
    }
  }

  private letGo() {
    if (!this.studio) return;
    this.close(this.studio);
    this.studio = null;
  }
}
