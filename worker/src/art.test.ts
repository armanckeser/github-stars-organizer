import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { APP_ART, readmeArt } from "./art.ts";
import { artResponse } from "./cards.ts";
import { drawInNode, looksOf, pngOf } from "./draw-node.test-helper.ts";
import { fakeWeb, type FakeFile } from "./fake-github.test-helper.ts";

// Every repo and address here is made up; the fake web answers them all without the network.
const REPO = "greendale/dreamatorium";
const RAW = `https://raw.githubusercontent.com/${REPO}/main`;
const GOOD = "https://pictures.example/study-room.png";
const BLUE = "#0000ff";
const RED = "#ff0000";

// A real 120x90 GIF of one colour (made with macOS `sips`).
const GREEN_GIF = Uint8Array.from(atob("R0lGODdheABaAJEAAAAAAAD/AP///wAAACH5BAkAAAMALAAAAAB4AFoAAAJ5jI+py+0Po5y02ouz3rz7D4biSJbmiabqyrbuC8fyTNf2jef6zvf+DwwKh8Si8YhMKpfMpvMJjUqn1Kr1is1qt9yu9wsOi8fksvmMTqvX7Lb7DY/L5/S6/Y7P6/f8vv8PGCg4SFhoeIiYqLjI2Oj4CBkpOUlZaZlUAAA7"), (c) => c.charCodeAt(0));

/** The same GIF grown past `bytes` with a comment block, which leaves the picture as it is. */
function gifOfSize(bytes: number): Uint8Array {
  const blocks = Math.ceil((bytes - GREEN_GIF.length) / 256);
  const comment = new Uint8Array(2 + blocks * 256 + 1);
  comment.set([0x21, 0xfe]);
  for (let i = 0; i < blocks; i++) comment[2 + i * 256] = 255;
  const out = new Uint8Array(GREEN_GIF.length + comment.length);
  out.set(GREEN_GIF.subarray(0, -1));
  out.set(comment, GREEN_GIF.length - 1);
  out[out.length - 1] = 0x3b;
  return out;
}

/** A PNG with padding after its end, so it still draws the same but weighs `bytes`. */
function padded(png: Uint8Array, bytes: number): Uint8Array {
  const out = new Uint8Array(bytes);
  out.set(png);
  return out;
}

let blue: FakeFile;
let red: FakeFile;
beforeAll(async () => {
  blue = { body: await pngOf(400, 300, BLUE), type: "image/png" };
  red = { body: await pngOf(400, 300, RED), type: "image/png" };
});

afterEach(() => vi.unstubAllGlobals());

/** The art for a README, with the pictures it names served from `files`, and every address asked for. */
async function artOf(readme: string, files: Record<string, FakeFile>): Promise<{ art: Uint8Array | null; asked: string[] }> {
  const web = fakeWeb({ [REPO]: readme }, files);
  vi.stubGlobal("fetch", web.fetch);
  return { art: await readmeArt(REPO, "token", drawInNode, APP_ART), asked: web.asked };
}

async function middleOf(art: Uint8Array | null): Promise<string> {
  if (!art) throw new Error("expected art, got none");
  return (await looksOf(art)).middle;
}

describe("picking a card's art from the README", () => {
  // Regression guarded: a build badge at the top of nearly every README became the card's art.
  test.each([
    ["a badge service", "https://img.shields.io/github/stars/greendale/dreamatorium.png"],
    ["a badge service's subdomain", "https://app.codecov.io/gh/greendale/dreamatorium/graph.png"],
    ["a badge in the path", "https://github.com/greendale/dreamatorium/actions/workflows/ci.yml/badge.svg"],
    ["an avatar", "https://avatars.githubusercontent.com/u/1?v=4"],
    ["a Stard card", "https://stars-demo.example/api/card/top4.svg?user=abed"],
    ["a plain http address", "http://pictures.example/old.png"],
  ])("skips %s without fetching it", async (_, skipped) => {
    const { art, asked } = await artOf(`![status](${skipped})\n\n![The study room](${GOOD})`, { [skipped]: red, [GOOD]: blue });
    expect(await middleOf(art)).toBe(BLUE);
    expect(asked).not.toContain(skipped);
  });

  // Regression guarded: an <img width="20"> icon in a README's header was fetched and used.
  test("skips an <img> declared smaller than 64 pixels without fetching it", async () => {
    const icon = "https://pictures.example/icon.png";
    const { art, asked } = await artOf(`<img src="${icon}" width="32" height="32"> <img src='${GOOD}' width="600">`, { [icon]: red, [GOOD]: blue });
    expect(await middleOf(art)).toBe(BLUE);
    expect(asked).not.toContain(icon);
  });

  test("skips a picture whose shorter side is under 64 pixels once read", async () => {
    const icon = "https://pictures.example/favicon.png";
    const { art } = await artOf(`![](${icon}) ![](${GOOD})`, { [icon]: { body: await pngOf(48, 48, RED) }, [GOOD]: blue });
    expect(await middleOf(art)).toBe(BLUE);
  });

  test("skips an SVG badge served from anywhere, by its shape: wider than four to one", async () => {
    const badge = "https://ci.example/status.svg";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="80"><rect width="420" height="80" fill="${RED}"/></svg>`;
    const { art } = await artOf(`![ci](${badge}) ![](${GOOD})`, { [badge]: { body: svg, type: "text/plain" }, [GOOD]: blue });
    expect(await middleOf(art)).toBe(BLUE);
  });

  test("skips a GIF over 1 MB and keeps the same GIF under it", async () => {
    const recording = "https://pictures.example/demo.gif";
    const heavy = await artOf(`![demo](${recording}) ![](${GOOD})`, { [recording]: { body: gifOfSize(1_100_000) }, [GOOD]: blue });
    expect(await middleOf(heavy.art)).toBe(BLUE);
    const light = await artOf(`![demo](${recording}) ![](${GOOD})`, { [recording]: { body: gifOfSize(900_000) }, [GOOD]: blue });
    expect(await middleOf(light.art)).toBe("#00ff00");
  });

  test("skips any picture over 3 MB", async () => {
    const poster = "https://pictures.example/poster.png";
    const { art } = await artOf(`![](${poster}) ![](${GOOD})`, { [poster]: { body: padded(await pngOf(400, 300, RED), 3_100_000) }, [GOOD]: blue });
    expect(await middleOf(art)).toBe(BLUE);
  });

  test("skips a WebP and a page that isn't a picture", async () => {
    const webp = "https://pictures.example/shot.webp";
    const page = "https://pictures.example/gallery";
    const files = { [webp]: { body: "RIFF\u0000\u0000\u0000\u0000WEBPVP8 ", type: "image/webp" }, [page]: { body: "<!doctype html><html><body>hi</body></html>", type: "text/html" }, [GOOD]: blue };
    const { art } = await artOf(`![](${webp}) ![](${page}) ![](${GOOD})`, files);
    expect(await middleOf(art)).toBe(BLUE);
  });

  test("ignores pictures inside comments and code blocks", async () => {
    const hidden = "https://pictures.example/hidden.png";
    const readme = `<!-- ![](${hidden}) -->\n\`\`\`md\n![](${hidden})\n\`\`\`\n![](${GOOD})`;
    const { art, asked } = await artOf(readme, { [hidden]: red, [GOOD]: blue });
    expect(await middleOf(art)).toBe(BLUE);
    expect(asked).not.toContain(hidden);
  });

  test("reads paths the way GitHub does: beside the README, from the repo's root, and blob links as raw files", async () => {
    const beside = await artOf("![](shots/one.png)", { [`${RAW}/docs/shots/one.png`]: blue });
    expect(await middleOf(beside.art)).toBe(BLUE);
    const fromRoot = await artOf("![](/img/two.png)", { [`${RAW}/img/two.png`]: blue });
    expect(await middleOf(fromRoot.art)).toBe(BLUE);
    const blob = await artOf(`![](https://github.com/${REPO}/blob/main/img/three.png)`, { [`https://github.com/${REPO}/raw/main/img/three.png`]: blue });
    expect(await middleOf(blob.art)).toBe(BLUE);
  });

  // Regression guarded: a README of thirty dead screenshots spent the Worker's subrequests on one card.
  test("tries at most three pictures", async () => {
    const missing = ["a", "b", "c"].map((name) => `https://pictures.example/${name}.png`);
    const { art, asked } = await artOf([...missing, GOOD].map((url) => `![](${url})`).join("\n"), { [GOOD]: blue });
    expect(art).toBeNull();
    expect(asked).not.toContain(GOOD);
  });

  test("has no art when the README has no picture, or there is no README", async () => {
    expect((await artOf("# Dreamatorium\nNo pictures here.", {})).art).toBeNull();
    const web = fakeWeb({});
    vi.stubGlobal("fetch", web.fetch);
    expect(await readmeArt(REPO, "token", drawInNode, APP_ART)).toBeNull();
  });
});

describe("sizing the art", () => {
  test("shrinks a large screenshot to 480 pixels on its longer side", async () => {
    const { art } = await artOf(`![](${GOOD})`, { [GOOD]: { body: await pngOf(1600, 1000, BLUE) } });
    expect(await looksOf(art!)).toEqual({ width: 480, height: 300, middle: BLUE });
  });

  test("never enlarges a small picture, but draws an SVG logo at full size", async () => {
    const small = await artOf(`![](${GOOD})`, { [GOOD]: { body: await pngOf(200, 100, BLUE) } });
    expect(await looksOf(small.art!)).toEqual({ width: 200, height: 100, middle: BLUE });
    const logo = "https://pictures.example/logo.svg";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="${BLUE}"/></svg>`;
    const drawn = await artOf(`![](${logo})`, { [logo]: { body: svg } });
    expect(await looksOf(drawn.art!)).toEqual({ width: 480, height: 480, middle: BLUE });
  });
});

describe("/api/card/art.png", () => {
  function served(readmes: Record<string, string>, files: Record<string, FakeFile>, repo = REPO): Promise<Response> {
    vi.stubGlobal("fetch", fakeWeb(readmes, files).fetch);
    return artResponse(new URLSearchParams({ repo }), "token", drawInNode);
  }

  test("answers with the art as a PNG the Worker caches", async () => {
    const response = await served({ [REPO]: `![](${GOOD})` }, { [GOOD]: blue });
    expect([response.status, response.headers.get("Content-Type"), response.headers.get("Cache-Control")]).toEqual([200, "image/png", "public, max-age=21600"]);
    expect((await looksOf(new Uint8Array(await response.arrayBuffer()))).middle).toBe(BLUE);
  });

  test("answers 404, cached, when there is no art, so the app shows the creature", async () => {
    const response = await served({ [REPO]: "No pictures." }, {});
    expect([response.status, response.headers.get("Cache-Control")]).toEqual([404, "public, max-age=21600"]);
  });

  test("answers 400 for a name that isn't owner/repo, and 502 uncached when GitHub fails", async () => {
    expect((await served({}, {}, "../../etc")).status).toBe(400);
    vi.stubGlobal("fetch", async () => new Response("", { status: 503 }));
    const failed = await artResponse(new URLSearchParams({ repo: REPO }), "token", drawInNode);
    expect([failed.status, failed.headers.get("Cache-Control")]).toEqual([502, "no-store"]);
  });
});
