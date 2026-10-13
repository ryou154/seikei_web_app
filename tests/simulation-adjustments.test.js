const test = require("node:test");
const assert = require("node:assert/strict");
const { create, strength } = require("../simulation-adjustments");

test("builds concrete generation adjustments and separates procedure examples", () => {
  const summary = create({
    style: "natural", eye: "wide", nose: "sharp", face: "vline",
    mouth: "none", forehead: "none", strength: 72, custom: {}
  });
  assert.deepEqual(summary.strength, { value: 72, label: "強め" });
  assert.deepEqual(summary.adjustments.map((item) => item.part), ["全体", "目元", "鼻", "輪郭"]);
  assert.match(summary.adjustments[1].change, /二重ライン/);
  assert.deepEqual(summary.relatedProcedures[0], {
    part: "目元", examples: ["二重整形（埋没法・切開法など）"]
  });
  assert.ok(summary.relatedProcedures.every((item) => !item.examples.some((value) => value.includes("確定"))));
});

test("custom requests are displayed but never guessed as a procedure", () => {
  const summary = create({
    style: "none", eye: "wide", nose: "none", face: "none",
    mouth: "none", forehead: "none", strength: 20,
    custom: { eye: "左右差を自然に整えたい" }
  });
  assert.deepEqual(summary.strength, { value: 20, label: "弱め" });
  assert.deepEqual(summary.adjustments, [{ part: "目元", change: "自由入力「左右差を自然に整えたい」という希望を生成条件として反映" }]);
  assert.deepEqual(summary.relatedProcedures, []);
});

test("strength is clamped and defaults safely", () => {
  assert.deepEqual(strength(101), { value: 100, label: "強め" });
  assert.deepEqual(strength("invalid"), { value: 50, label: "標準" });
});
