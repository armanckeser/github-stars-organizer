import { useMemo } from "react";
import { Marked } from "marked";
import { CARD_ORIGIN } from "@/lib/published-list";

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The only raw HTML the composed README holds: the fold around a List's repos.
const FOLD_TAGS = /^(<details>|<\/details>|<summary>[^<]*<\/summary>|\s)+$/;

// GitHub renders a README as sanitized HTML. The preview gets the same safety by
// showing other raw HTML as text, loading images only from the cards' own address,
// and linking only to web and mail addresses.
const marked = new Marked({
  gfm: true,
  renderer: {
    html: ({ text }) => (FOLD_TAGS.test(text) ? text : escapeHtml(text)),
    image: ({ href, text }) =>
      href.startsWith(`${CARD_ORIGIN}/api/card/`)
        ? `<img src="${escapeHtml(href)}" alt="${escapeHtml(text)}" loading="lazy" />`
        : escapeHtml(text),
    link({ href, tokens }) {
      const text = this.parser.parseInline(tokens);
      if (!/^(https?:|mailto:)/i.test(href)) return text;
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
  },
});

// The README is drawn the way GitHub draws one: GitHub's own type, sizes and link
// colour, not the app's, so what is on screen is what lands on the profile.
const GITHUB_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif";
const README_STYLE = [
  "text-base leading-normal text-foreground break-words",
  "[&_h1]:mb-4 [&_h1]:border-b [&_h1]:border-border [&_h1]:pb-2 [&_h1]:text-[2em] [&_h1]:font-semibold [&_h1]:leading-tight",
  "[&_h2]:mt-6 [&_h2]:mb-4 [&_h2]:border-b [&_h2]:border-border [&_h2]:pb-1.5 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:leading-tight",
  "[&_p]:mb-4 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-8 [&_li+li]:mt-1",
  "[&_a]:text-[#0969da] dark:[&_a]:text-[#4493f8] hover:[&_a]:underline",
  "[&_img]:inline-block [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-xl [&_img]:bg-muted/40",
  "[&_details]:mb-4 [&_summary]:cursor-pointer [&_summary]:text-muted-foreground [&_details[open]>summary]:mb-3",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]",
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
].join(" ");

export function ReadmePreview({ markdown }: { markdown: string }) {
  const html = useMemo(() => marked.parse(markdown, { async: false }), [markdown]);
  return <div className={README_STYLE} style={{ fontFamily: GITHUB_FONT }} dangerouslySetInnerHTML={{ __html: html }} />;
}
