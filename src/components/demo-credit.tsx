// The demo's credit line: who made it, where to hear about new releases, and what the page collects. Rendered
// only inside DemoNote in a demo build (see routes/__root.tsx), so a self-hosted instance never shows it. It is
// the one place the app names its author's site, which is why the publish gate's personal-domain rule is allowed
// for this file and nowhere else.
const linkClass = "font-medium text-primary underline-offset-4 hover:underline";

export function DemoCredit() {
  return (
    <>
      Made by{" "}
      <a href="https://armanckeser.com" target="_blank" rel="noopener" className={linkClass}>
        Armanc Keser
      </a>
      <span aria-hidden> · </span>
      <a href="https://armanckeser.com/subscribe" target="_blank" rel="noopener" className={linkClass}>
        Get new releases
      </a>
      <span aria-hidden> · </span>
      <a href="https://armanckeser.com/privacy#demos" target="_blank" rel="noopener" className={linkClass}>
        Privacy
      </a>
    </>
  );
}
