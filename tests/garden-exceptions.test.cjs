const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const script = fs.readFileSync(path.join(__dirname, "..", "restore-hastings-bin-calendar.user.js"), "utf8");
const context = vm.createContext({ Date, XMLHttpRequest: function () {} });
vm.runInContext(script.replace(/\}\)\(\);\s*$/, `
  globalThis.testApi = { parseGardenSuspensionRule };
})();`), context);
const { parseGardenSuspensionRule: parse } = context.testApi;

function expectRule(text, expectedYear, startOffsetDays, durationDays, contextYear) {
  const rule = parse(text, contextYear);
  assert.ok(rule, "Expected a garden suspension rule");
  assert.equal(rule.sourceChristmasYear, expectedYear);
  assert.equal(rule.startOffsetDays, startOffsetDays);
  assert.equal(rule.durationDays, durationDays);
}

test("published 2022 wording covers garden and bulky collections together", () => {
  expectRule("Garden waste and bulky waste collections will be suspended from Monday 26 December and will restart on Monday 9 January 2023.",
    2022, 1, 14);
});

test("published 2023 wording resolves omitted years from the source year", () => {
  expectRule("Garden waste collections are suspended from Monday 25 December and restart on Monday 8 January.",
    2023, 0, 14, 2023);
});

test("published 2024 wording keeps the garden start separate from bulky waste", () => {
  expectRule("Bulky waste collections are suspended from Monday 23 December and restart on Wednesday 8 January 2025. Garden waste collections are suspended from Wednesday 25 December and restart on Wednesday 8 January 2025.",
    2024, 0, 14);
});

test("published 2025 wording accepts 'also suspended' and 'will restart'", () => {
  expectRule("Bulky waste collections will be suspended from Thursday 25 December and restart on Friday 2 January 2026. Garden waste collections are also suspended from Thursday 25 December and will restart on Thursday 8 January 2026.",
    2025, 0, 14);
});

test("the collections page's split words and nonbreaking spaces are normalised", () => {
  expectRule("G arden waste collections are suspended from Thursday 25 December and back to normal on Thursday 8\u00a0Jan uary 2026.",
    2025, 0, 14);
});

test("garden pause and resumption may appear in separate sentences", () => {
  expectRule("Garden waste collections will pause from 24 December 2026. They resume on 7 January 2027.",
    2026, -1, 14);
});

test("a repeated garden subject can supply the restart date", () => {
  expectRule("Garden waste collections are suspended from 25 December 2026. Garden waste collections return to normal on 8 January 2027.",
    2026, 0, 14);
});

test("ordinal dates and abbreviated months do not require weekdays", () => {
  expectRule("Garden waste collections are suspended from 25th Dec 2026. Collections restart on 8th Jan 2027.",
    2026, 0, 14);
});

test("a garden suspension cannot borrow a bulky-waste restart date", () => {
  assert.equal(parse("Garden waste collections are suspended from 25 December 2026. Bulky waste collections restart on 2 January 2027."), null);
});

test("a garden restart cannot borrow a bulky-waste suspension date", () => {
  assert.equal(parse("Bulky waste collections are suspended from 25 December 2026. Garden waste collections restart on 8 January 2027."), null);
});

test("an intervening bulky-waste sentence does not replace the explicit garden restart", () => {
  expectRule("Garden waste collections are suspended from 25 December 2026. Bulky waste collections restart on 2 January 2027. Garden waste collections restart on 8 January 2027.",
    2026, 0, 14);
});

test("an unrelated Christmas-tree date is not a garden suspension", () => {
  assert.equal(parse("Christmas trees can be placed in garden waste bins. Book a tree collection by 5 January 2027 for collection on 8 January 2027."), null);
});

test("the written December date always starts the suspension", () => {
  expectRule("Garden waste collections: last collection on 24 December 2026 before suspension; collections resume on 8 January 2027.",
    2026, -1, 15);
});

test("a contrast with garden waste does not transfer bulky-waste suspension dates", () => {
  assert.equal(parse("Bulky waste, unlike garden waste, will be suspended from 25 December 2026 and restart on 8 January 2027."), null);
});

test("repeated identical suspension notices are consistent", () => {
  const notice = "Garden waste collections are suspended from 25 December 2026 and restart on 8 January 2027.";
  expectRule(notice + " " + notice, 2026, 0, 14);
});

test("a repeated matching garden restart date is consistent", () => {
  expectRule("Garden waste collections are suspended from 25 December 2026 and restart on 8 January 2027. Garden waste collections restart on 8 January 2027.",
    2026, 0, 14);
});

test("conflicting garden restart dates are rejected", () => {
  assert.equal(parse("Garden waste collections are suspended from 25 December 2026 and restart on 8 January 2027. Garden waste collections restart on 9 January 2027."), null);
});

test("conflicting garden suspension dates are rejected", () => {
  assert.equal(parse("Garden waste collections are suspended from 25 December 2026 and restart on 8 January 2027. Garden waste collections are suspended from 26 December 2026 and restart on 8 January 2027."), null);
});

for (const [description, text] of [
  ["impossible calendar dates", "Garden waste collections are suspended from 32 December 2026 and restart on 8 January 2027."],
  ["summer dates", "Garden waste collections are suspended from 25 July 2026 and restart on 8 August 2026."],
  ["a repeated December date without a January date", "Garden waste collections are suspended from 25 December 2026 and restart on 25 December 2026."],
  ["a day zero in January", "Garden waste: 25 December and 0 January."],
  ["a February end date", "Garden waste collections are suspended from 1 December 2026 and restart on 8 February 2027."],
  ["a 32-day suspension", "Garden waste: 20 December and 21 January."]
]) {
  test(`rejects ${description}`, () => assert.equal(parse(text), null));
}

test("a winter suspension can last from one to 31 days", () => {
  expectRule("Garden waste: 20 December 2026 and 20 January 2027.", 2026, -5, 31);
  expectRule("Garden waste: 1 January then 31 December 2026.", 2026, 6, 1);
});

test("years identify the source independently of the interval", () => {
  expectRule("Garden waste: 25 December 2026 and 8 January 2026.", 2026, 0, 14);
  expectRule("Garden waste: 8 January 2025 and 25 December 2024.", 2026, 0, 14, 2026);
  expectRule("Garden waste: 25 December 2024, 25 December 2025 and 8 January.", 2026, 0, 14, 2026);
  expectRule("Garden waste: 25 December and 8 January.", null, 0, 14);
});

for (const label of ["Garden and bulky waste collections", "Bulky waste & garden waste", "Garden waste / bulky waste"]) {
  test("combined service label: " + label, () => expectRule(label + "\n25 December and 8 January.", 2026, 0, 14, 2026));
}

test("a bulky waste notice beneath a combined label has its own dates", () => {
  expectRule("Garden and bulky waste collections\n25 December and 8 January.\nBulky waste: 23 December and 2 January.", 2026, 0, 14, 2026);
});

// All of these describe the same interval: 25 December is paused, 8 January is back.
for (const sentence of [
  "Garden waste collections will be suspended from 25 December 2025 until 8 January 2026.",
  "Collections will be suspended from 25 December and resume on 8 January.",
  "Collections will stop on 25 December and restart on 8 January.",
  "Collections will resume on 8 January following the Christmas suspension starting on 25 December.",
  "Garden waste collections will be suspended from Thursday 25th December 2025, with normal service resuming on Thursday 8th January 2026."
]) {
  test(sentence, () => expectRule("Garden waste collections\n" + sentence, 2025, 0, 14, 2025));
}

for (const sentence of [
  "There will be no collections between 25 December and 7 January inclusive.",
  "The suspension will run from 25 December to 7 January inclusive.",
  "25 December – 7 January: No collections.",
  "Collections are paused from 25 December until 7 January inclusive.",
  "Collections will be paused from 25 December through 7 January."
]) {
  test(sentence, () => expectRule("Garden waste collections\n" + sentence, 2025, 0, 13, 2025));
}

for (const sentence of [
  "Garden waste collections will be suspended over Christmas.",
  "Garden waste collections will be suspended for two weeks from 25 December.",
  "Garden waste collections will pause from 25th Dec. for 14 days.",
  "Garden waste collections are suspended for about two weeks from 25 December.",
  "Garden waste collections are suspended from 25 December while the office closes for two weeks.",
  "Garden waste collections are suspended for two weeks and 3 days from 25 December.",
  "Garden waste collections are suspended from 25 December for two weeks and three days.",
  "Garden waste collections stop from 25 December until 8 January and resume on 9 January.",
  "Garden waste collections stop from 25 December until 8 or 9 January.",
  "Bulky waste collections stop on 25 December. Garden waste collections resume on 8 January.",
  "Garden waste: 25 December until 7 January inclusive. Next round on 8 January.",
  "Garden waste: 32/12/2025 and 08/01/2026.",
  "Garden waste: 8 January, 9 January.",
  "Garden waste: 25 December.",
  "Garden waste: 24 December, 25 December, 8 January.",
  "Garden waste: 1 December and 31 January."
]) {
  test("declines: " + sentence, () => assert.equal(parse(sentence, 2025), null));
}

for (const sentence of [
  "Garden waste collection dates are 25 December and 8 January.",
  "Garden waste collections may be suspended from 25 December until 8 January.",
  "Garden waste collections are suspended from 25 December until 8 January unless the weather changes.",
  "Garden waste | 8 January / 25 December",
  "Garden waste. Pencil in 8 Jan 2026. The other date for your diary is 25 Dec.",
  "Garden waste: 08/01/2026, 25/12/2025.",
  "Garden bins: 2026-01-08, 2025-12-25.",
  "Bulky waste: 2 January. Garden waste: 8 Jan 2026. If you keep a diary, mark 25 Dec too.",
  "Bulky waste 23 Dec and 2 Jan, garden waste 8 Jan and 25 Dec, food waste on 26 Dec.",
  "Garden waste: 25 December.\nCircle 8 January on your calendar.",
  "8 January and 25 December are the dates for garden waste.",
  "Garden waste collections stop from 25 December until 8 January. The suspension will last for three weeks."
]) {
  test("extracts the published pair: " + sentence, () => expectRule(sentence, 2025, 0, 14, 2025));
}

test("an unqualified later date is the first collection day back", () => {
  expectRule("Garden waste collections are suspended from 25 December to 7 January.", 2025, 0, 13, 2025);
});

test("after does not shift the December date", () => {
  expectRule("Garden waste collections will be suspended after 24 December. Normal service resumes on 8 January.", 2025, -1, 15, 2025);
});

test("a published January date takes precedence over a duration estimate", () => {
  expectRule("Garden waste collections stop for two weeks from 25 December and resume on 9 January.", 2025, 0, 15, 2025);
});
