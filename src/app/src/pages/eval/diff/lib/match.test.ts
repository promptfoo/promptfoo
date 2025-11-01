// src/pages/eval/diff/lib/match.test.ts
import { buildRows } from "./match";
import { RunSummary } from "./types";

const B: RunSummary = {
  runId: "b",
  items: [
    { key: "k1", output: "foo",  pass: false, score: 0.2 },
    { key: "k2", output: "same", pass: true,  score: 0.8 },
    { key: "k3", output: "gone", pass: true,  score: 0.9 }
  ]
};

const C: RunSummary = {
  runId: "c",
  items: [
    { key: "k1", output: "foo!!!", pass: true,  score: 0.7 }, // pass flips false→true → improved
    { key: "k2", output: "same",   pass: true,  score: 0.8 }, // same
    { key: "k4", output: "new",    pass: false, score: 0.1 }  // added
  ]
};

it("classifies rows", () => {
  const rows = buildRows(B, C);
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  expect(by.k1.status).toBe("improved");
  expect(by.k2.status).toBe("same");
  expect(by.k3.status).toBe("removed");
  expect(by.k4.status).toBe("added");
});