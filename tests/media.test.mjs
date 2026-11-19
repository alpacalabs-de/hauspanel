// Music search in the player popup: what Music Assistant finds, grouped by kind.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB } from "./fake.mjs";

const { groupResults } = await import(LIB + "media.js");

const item = (kind, n, extra = {}) => ({ media_type: kind, uri: `spotify://${kind}/${n}`, name: `${kind} ${n}`, image: null, ...extra });
const kinds = (groups) => groups.map((g) => g.kind);
const names = (groups, kind) => groups.find((g) => g.kind === kind).items.map((i) => i.name);

test("songs, artists, albums and playlists, in that order", () => {
  const groups = groupResults({
    playlists: [item("playlist", 1)],
    albums: [item("album", 1)],
    artists: [item("artist", 1)],
    tracks: [item("track", 1), item("track", 2)],
    radio: [item("radio", 1)],
  });
  assert.deepEqual(kinds(groups), ["track", "artist", "album", "playlist"]);
  assert.deepEqual(names(groups, "track"), ["track 1", "track 2"]);
  // Radio and the other kinds Music Assistant knows stay out.
  assert.equal(groups.length, 4);
});

test("at most a few per kind", () => {
  const many = Array.from({ length: 20 }, (_, i) => item("track", i));
  const groups = groupResults({ tracks: many }, [], 6);
  assert.equal(groups[0].items.length, 6);
  assert.deepEqual(names(groups, "track"), ["track 0", "track 1", "track 2", "track 3", "track 4", "track 5"]);
  assert.equal(groupResults({ tracks: many }, [], 2)[0].items.length, 2);
});

test("your own playlists come first, and nothing shows up twice", () => {
  const mine = [item("playlist", 1, { name: "My mix" }), item("playlist", 9, { name: "Sunday" })];
  const groups = groupResults({ playlists: [item("playlist", 2, { name: "Found" }), item("playlist", 1, { name: "My mix" })] }, mine);
  assert.deepEqual(names(groups, "playlist"), ["My mix", "Sunday", "Found"]);
});

test("nothing, empty and broken answers", () => {
  assert.deepEqual(groupResults(null), []);
  assert.deepEqual(groupResults(undefined, []), []);
  assert.deepEqual(groupResults({ tracks: [], artists: [], albums: [], playlists: [] }), []);
  // Items without a uri or a name can't be played, so they stay out.
  const groups = groupResults({ tracks: [null, { name: "no uri" }, { uri: "x://1" }, item("track", 1)] });
  assert.deepEqual(kinds(groups), ["track"]);
  assert.deepEqual(names(groups, "track"), ["track 1"]);
});

test("every entry carries the kind it is played with", () => {
  const groups = groupResults({
    tracks: [{ uri: "spotify://track/1", name: "No kind" }],
    albums: [item("album", 1)],
  });
  assert.equal(groups.find((g) => g.kind === "track").items[0].media_type, "track");
  assert.equal(groups.find((g) => g.kind === "album").items[0].media_type, "album");
});

test("the headings are text keys that exist in every language", async () => {
  const i18n = await import(LIB + "i18n.js");
  const groups = groupResults({ tracks: [item("track", 1)], artists: [item("artist", 1)], albums: [item("album", 1)], playlists: [item("playlist", 1)] });
  assert.deepEqual(groups.map((g) => g.label), ["songs", "artists", "albums", "playlists"]);
  for (const g of groups) assert.ok(i18n.BUILTIN.en[g.label], `${g.label} is a text`);
});
