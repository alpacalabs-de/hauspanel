// Every frontend module loads: a typo or a broken import would leave the whole panel blank.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { LIB } from "./fake.mjs";

const dir = new URL(LIB);
for (const f of readdirSync(dir).filter((x) => x.endsWith(".js"))) {
  test(`lib/${f} loads`, async () => {
    const m = await import(LIB + f);
    assert.ok(Object.keys(m).length > 0, "exports something");
  });
}

// The oldest browser HausPanel has to get along with is Safari 15 on an iPad that Apple
// stopped updating (iPad Air 2, mini 4, iPad 5 — the usual wall tablets). These are syntax,
// not features: the file does not even parse, every module that imports it goes with it, and
// the panel stays blank with "Unable to load custom panel". Node reads them happily, so no
// other test would notice. A lookbehind added to model.js in 1.6.4 did exactly that.
const TOO_NEW = [
  [/\(\?<[=!]/, "a regular expression lookbehind — Safari understands it only from 16.4"],
  [/^[ \t]*static[ \t]*\{/m, "a static initialisation block — Safari understands it only from 16.4"],
];

const sources = [
  ["hauspanel.js", new URL("../hauspanel.js", dir)],
  ...readdirSync(dir)
    .filter((x) => x.endsWith(".js"))
    .map((f) => [`lib/${f}`, new URL(f, dir)]),
];

for (const [name, url] of sources) {
  test(`${name} parses on Safari 15`, () => {
    const src = readFileSync(url, "utf8");
    for (const [pattern, why] of TOO_NEW) {
      const line = src.split("\n").findIndex((l) => pattern.test(l)) + 1;
      assert.ok(!pattern.test(src), `${name}:${line} uses ${why}`);
    }
  });
}
