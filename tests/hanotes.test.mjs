// Home Assistant's own notifications as a notice: keeping the list in step, and how it reads.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIB, fakeHass } from "./fake.mjs";

const { mergeNotes, sortNotes, plainText, noteTitle, notesLine, whenText, haNotesOn } = await import(LIB + "hanotes.js");

const note = (id, title, created_at, message = "") => ({ notification_id: id, title, message, created_at });

test("the list follows Home Assistant's updates", () => {
  // "current" is the whole list and replaces whatever we had.
  let map = mergeNotes({ "old.one": note("old.one", "Gone") }, "current", { a: note("a", "First") });
  assert.deepEqual(Object.keys(map), ["a"]);
  // "added" and "updated" merge in.
  map = mergeNotes(map, "added", { b: note("b", "Second") });
  assert.deepEqual(Object.keys(map).sort(), ["a", "b"]);
  map = mergeNotes(map, "updated", { a: note("a", "First, changed") });
  assert.equal(map.a.title, "First, changed");
  assert.equal(Object.keys(map).length, 2, "an update is no new entry");
  // "removed" takes them out again.
  map = mergeNotes(map, "removed", { a: note("a", "First, changed") });
  assert.deepEqual(Object.keys(map), ["b"]);
  // Nothing at all does no harm.
  assert.deepEqual(mergeNotes(undefined, "current", undefined), {});
  assert.deepEqual(mergeNotes({ b: note("b", "Second") }, "added", null), { b: note("b", "Second") });
});

test("newest first, and the pill says what is waiting", () => {
  const map = {
    a: note("a", "Backup done", "2026-11-23T08:00:00+00:00"),
    b: note("b", "Login failed", "2026-11-23T10:30:00+00:00"),
    c: note("c", "Update available", "2026-11-22T19:00:00+00:00"),
  };
  assert.deepEqual(sortNotes(map).map((n) => n.notification_id), ["b", "a", "c"]);
  assert.equal(notesLine(sortNotes(map)), "Login failed +2");
  assert.equal(notesLine([map.b]), "Login failed", "one alone needs no count");
  assert.equal(notesLine([]), "");
  assert.equal(notesLine(undefined), "");
  assert.deepEqual(sortNotes(undefined), []);
});

test("a notification reads as plain text, never as markup", () => {
  assert.equal(plainText("<b>Careful</b>, the door is <i>open</i>"), "Careful, the door is open");
  assert.equal(plainText("line one<br>line two"), "line one\nline two");
  assert.equal(plainText("**bold** and *thin* and `code`"), "bold and thin and code");
  assert.equal(plainText("# Heading\n> quoted"), "Heading\nquoted");
  assert.equal(plainText("see [the docs](https://example.com/x)"), "see the docs");
  assert.equal(plainText("<script>alert(1)</script>"), "alert(1)", "a tag is never left standing");
  assert.equal(plainText("a\n\n\n\nb"), "a\n\nb", "no endless gaps");
  assert.equal(plainText(null), "");
  // The title falls back to the first line of the message, then to the word itself.
  assert.equal(noteTitle(note("a", "", "", "First line\nsecond")), "First line");
  assert.equal(noteTitle(note("a", "A title", "", "text")), "A title");
});

test("the time shows the clock today and the date before that", () => {
  const hass = fakeHass({});
  const now = new Date(2026, 10, 23, 12, 0);
  assert.match(whenText(hass, new Date(2026, 10, 23, 8, 5).toISOString(), now), /^\d{1,2}:\d{2}/);
  assert.notEqual(whenText(hass, new Date(2026, 10, 21, 8, 5).toISOString(), now).length,
    whenText(hass, new Date(2026, 10, 23, 8, 5).toISOString(), now).length, "an older one carries its date");
  assert.equal(whenText(hass, "", now), "");
  assert.equal(whenText(hass, "not a date", now), "");
});

test("the notice stays off until someone asks for it", () => {
  // Home Assistant also files system messages there, so it is never on by accident.
  assert.equal(haNotesOn({ settings: { s: {} } }), false);
  assert.equal(haNotesOn({ settings: { s: { haNotes: false } } }), false);
  assert.equal(haNotesOn({ settings: { s: { haNotes: true } } }), true);
});
