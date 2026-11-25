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

// Ad blockers do not only block other people's domains: EasyPrivacy and friends carry generic
// rules like "/thermostat.js" that match any site, the user's own Home Assistant included. A
// panel file with such a name never arrives, and every module importing it goes down with it —
// the panel stays blank. That is why the thermostat popup lives in climate.js (#37, 1.19.1).
// The list below is the plain, everyday names out of those rules, the kind a panel module could
// really be called. To refresh it, pull easyprivacy_general.txt, easyprivacy_trackingservers.txt,
// easylist_general_block.txt and uBlock's filters.txt and privacy.txt, then:
//   grep -hv '^!' *.txt | grep -oE '^/[a-z0-9_-]+\.js' | sed 's#^/##' | sort -u
const BLOCKED_NAMES = `
analyse analytics beacon cnt counter fingerprint ga gpt hawk hawkeye ht impression infinity
instantpage invoke jquery keypress log logview magpie matomo metrika pageview pixels pixeltag
plausible pop popup px quant referrer rollbar sbar sdc stat statistics stats sw tags thermostat
track tracker tracking ut utrack visitor webstat webstats
`
  .split(/\s+/)
  .filter(Boolean)
  .map((n) => `${n}.js`);

test("no frontend file is named like a script ad blockers block", () => {
  const bad = sources.map(([name]) => name).filter((name) => BLOCKED_NAMES.includes(name.replace(/^lib\//, "")));
  assert.deepEqual(bad, [], `ad blockers drop these files on every site, so the panel would not load: ${bad.join(", ")}`);
});

for (const [name, url] of sources) {
  test(`${name} parses on Safari 15`, () => {
    const src = readFileSync(url, "utf8");
    for (const [pattern, why] of TOO_NEW) {
      const line = src.split("\n").findIndex((l) => pattern.test(l)) + 1;
      assert.ok(!pattern.test(src), `${name}:${line} uses ${why}`);
    }
  });
}
