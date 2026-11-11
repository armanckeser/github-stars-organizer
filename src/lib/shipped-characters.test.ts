import { describe, expect, test } from "vitest";
import { readCharacterFile } from "../../server/character";
import { OPPONENTS } from "./run";

const files = import.meta.glob<string>("../../characters/*.md", { query: "?raw", import: "default", eager: true });
const shipped: [string, string][] = Object.entries(files)
  .map(([path, text]): [string, string] => [path.split("/").pop() ?? path, text])
  .filter(([name]) => name !== "README.md");
const names = shipped.map(([name]) => name);

describe("the character files in characters/", () => {
  // Regression guarded: an opponent fought in every run still has a look made from
  // their username because nobody wrote their file.
  test("shipped_files_cover_every_opponent_and_armanckeser_when_the_list_changes", () => {
    for (const login of ["armanckeser", ...OPPONENTS]) expect(names).toContain(`${login}.md`);
  });

  // Regression guarded: a typo in a shipped file ("hair: medum") is ignored without a
  // word, so the figure quietly loses that part.
  test.each(shipped)("every_line_of_%s_is_read_when_the_file_is_shipped", (_name, text) => {
    const lines = text.split("\n").filter((line) => line.trim() !== "");
    const read = readCharacterFile(text);
    expect(Object.keys(read.look).length + ["name", "klass", "motto"].filter((key) => key in read).length).toBe(lines.length);
  });

  test("a_file_name_is_the_login_in_lower_case_when_the_game_looks_it_up", () => {
    for (const name of names) expect(name).toBe(name.toLowerCase());
  });
});
