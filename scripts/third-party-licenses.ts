import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

// Writes THIRD-PARTY-LICENSES.txt beside a build: the name, version, license and
// license text of every npm package bundled into it. MIT, BSD and Apache require
// their notices to travel with copies of the code, and a bundle is a copy.
// A package under a license not listed here fails the build, so a new
// dependency's terms get read before they ship.

const ALLOWED_LICENSES = new Set([
  "MIT", "MIT-0", "ISC", "0BSD", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0",
  "CC0-1.0", "Unlicense", "BlueOak-1.0.0", "OFL-1.1", "CC-BY-4.0", "Python-2.0",
]);

// Packages that ship a license file but no `license` field, checked by hand.
const DECLARED_BY_HAND: Record<string, string> = {
  "@journeyapps/wa-sqlite": "MIT", // LICENSE: MIT, Roy T. Hashimoto; SQLite itself is public domain
};

const LICENSE_FILE = /^(licen[cs]e|copying|notice)(\.|$)/i;

type BundledPackage = { name: string; version: string; license: string; text: string };

/** The package a module belongs to: the path after its last node_modules/. */
function packageRootOf(moduleId: string): string | null {
  const file = moduleId.replace(/^\0/, "").split("?")[0];
  const marker = `${path.sep}node_modules${path.sep}`;
  const at = file.lastIndexOf(marker);
  if (at === -1) return null;
  const rest = file.slice(at + marker.length).split(path.sep);
  const depth = rest[0].startsWith("@") ? 2 : 1;
  return file.slice(0, at + marker.length) + rest.slice(0, depth).join(path.sep);
}

function describe(root: string): BundledPackage {
  const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    name: string; version: string; license?: string | { type: string };
  };
  const declared = typeof manifest.license === "object" ? manifest.license.type : manifest.license;
  const license = declared ?? DECLARED_BY_HAND[manifest.name] ?? "UNKNOWN";
  const files = readdirSync(root).filter((name) => LICENSE_FILE.test(name)).sort();
  const text = files.map((name) => readFileSync(path.join(root, name), "utf8").trim()).join("\n\n");
  return { name: manifest.name, version: manifest.version, license, text };
}

/** "MIT", "(MIT OR Apache-2.0)" and "MIT AND ISC": allowed when some alternative is entirely allowed. */
function isAllowed(expression: string): boolean {
  return expression
    .replace(/[()]/g, "")
    .split(/\s+OR\s+/)
    .some((alternative) => alternative.split(/\s+AND\s+/).every((id) => ALLOWED_LICENSES.has(id.trim())));
}

export type ThirdPartyLicensesOptions = {
  /**
   * Packages bundled without passing through the module graph: a CSS @import that
   * Tailwind inlines, or code a dependency ships already bundled into an asset.
   */
  alsoBundled?: string[];
  fileName?: string;
};

function bundledRoots(moduleIds: Iterable<string>): string[] {
  return [...moduleIds].flatMap((id) => {
    const root = packageRootOf(id);
    return root && existsSync(path.join(root, "package.json")) ? [root] : [];
  });
}

function writeNotices(packages: BundledPackage[]): string {
  return [
    "Stars Organizer bundles the following open source packages. Their licenses follow.",
    ...packages.map((bundled) => [
      "-".repeat(72),
      `${bundled.name}@${bundled.version}`,
      `License: ${bundled.license}`,
      "",
      bundled.text || `(This package ships no license file. Its package.json declares ${bundled.license}.)`,
    ].join("\n")),
  ].join("\n\n") + "\n";
}

export function thirdPartyLicenses({ alsoBundled = [], fileName = "THIRD-PARTY-LICENSES.txt" }: ThirdPartyLicensesOptions = {}): Plugin {
  const roots = new Set(alsoBundled.map((name) => path.resolve("node_modules", name)));

  return {
    name: "third-party-licenses",
    apply: "build",
    generateBundle() {
      for (const root of bundledRoots(this.getModuleIds())) roots.add(root);
      const packages = [...roots].map(describe);
      // One entry per name@version; a package can be reached through several paths.
      const unique = [...new Map(packages.map((bundled) => [`${bundled.name}@${bundled.version}`, bundled])).values()]
        .sort((a, b) => a.name.localeCompare(b.name));

      const refused = unique.filter((bundled) => !isAllowed(bundled.license));
      if (refused.length > 0) {
        this.error(`Bundled packages under licenses not on the allowlist in scripts/third-party-licenses.ts: ${
          refused.map((bundled) => `${bundled.name}@${bundled.version} (${bundled.license})`).join(", ")}`);
      }
      const missingText = unique.filter((bundled) => !bundled.text).map((bundled) => bundled.name);
      if (missingText.length > 0) this.warn(`No license file found for: ${missingText.join(", ")}`);
      this.emitFile({ type: "asset", fileName, source: writeNotices(unique) });
    },
  };
}
