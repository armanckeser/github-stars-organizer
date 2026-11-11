import { useMemo } from "react";
import { Marked } from "marked";

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// GitHub renders a README as sanitized HTML. The preview gets the same safety by
// showing raw HTML as text, dropping images, and linking only to web and mail addresses.
const marked = new Marked({
  gfm: true,
  renderer: {
    html: ({ text }) => escapeHtml(text),
    image: ({ text }) => escapeHtml(text),
    link({ href, tokens }) {
      const text = this.parser.parseInline(tokens);
      if (!/^(https?:|mailto:)/i.test(href)) return text;
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
  },
});

// The README's look is GitHub's: plain headings with a rule under the first two, a bulleted list.
const README_STYLE = [
  "text-[15px] leading-relaxed text-foreground break-words",
  "[&_h1]:mb-4 [&_h1]:border-b [&_h1]:border-border [&_h1]:pb-2 [&_h1]:text-3xl [&_h1]:font-semibold",
  "[&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:border-b [&_h2]:border-border [&_h2]:pb-1.5 [&_h2]:text-xl [&_h2]:font-semibold",
  "[&_p]:my-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:my-1",
  "[&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.9em]",
  "[&_hr]:my-6 [&_hr]:border-border",
].join(" ");

export function ReadmePreview({ markdown }: { markdown: string }) {
  const html = useMemo(() => marked.parse(markdown, { async: false }), [markdown]);
  return <div className={README_STYLE} dangerouslySetInnerHTML={{ __html: html }} />;
}
