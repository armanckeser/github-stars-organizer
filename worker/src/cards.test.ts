import { afterEach, describe, expect, test, vi } from "vitest";
import { cardResponse } from "./cards.ts";
import { drawInNode, pngOf } from "./draw-node.test-helper.ts";
import { fakeWeb } from "./fake-github.test-helper.ts";

afterEach(() => vi.unstubAllGlobals());

describe("a README card's posters", () => {
  // Regression guarded: README cards kept the owner's avatar while the app showed the repo's own picture.
  test("show the README's picture in the avatar's place, and the avatar where a README has none", async () => {
    const shot = "https://pictures.example/dreamatorium.png";
    const web = fakeWeb(
      { "greendale/dreamatorium": `# Dreamatorium\n![](${shot})`, "city-college/mascot": "# Mascot" },
      {
        [shot]: { body: await pngOf(800, 500, "#0000ff") },
        "https://avatars.example/greendale": { body: await pngOf(96, 96, "#ff0000"), type: "image/png" },
        "https://avatars.example/city-college": { body: await pngOf(96, 96, "#ff0000"), type: "image/png" },
      },
    );
    vi.stubGlobal("fetch", web.fetch);
    const response = await cardResponse("top4", new URLSearchParams({ user: "study-group-abed", repos: "greendale/dreamatorium,city-college/mascot" }), "token", drawInNode);
    const svg = await response.text();

    expect(response.status).toBe(200);
    expect(svg.match(/<image [^>]*preserveAspectRatio="xMidYMid meet"/g)).toHaveLength(1);
    expect(svg.match(/<image [^>]*clip-path=/g)).toHaveLength(1);
    expect(web.asked).toContain(shot);
    expect(web.asked).not.toContain("https://avatars.example/greendale");
    expect(web.asked).toContain("https://avatars.example/city-college");
  });

  test("still draw when GitHub can't read a README", async () => {
    const web = fakeWeb({}, {});
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).endsWith("/readme") ? new Response("", { status: 503 }) : web.fetch(input, init));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await cardResponse("top4", new URLSearchParams({ user: "study-group-abed", repos: "greendale/dreamatorium" }), "token", drawInNode);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(">dreamatorium</text>");
  });
});
