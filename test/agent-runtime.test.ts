import assert from "node:assert/strict";
import test from "node:test";
import { readWindowOverlaps } from "../src/core/agent-runtime";

test("blocks overlapping reads of the same file", () => {
	const previous = new Map([["niplex-obsidian/mocs/mocs super.md", [{ startLine: 1, endLine: 50 }]]]);
	assert.equal(readWindowOverlaps("NIPLEX-OBSIDIAN/MOCs/MOCs super.md", 1, 50, previous), true);
	assert.equal(readWindowOverlaps("NIPLEX-OBSIDIAN/MOCs/MOCs super.md", 25, 75, previous), true);
	assert.equal(readWindowOverlaps("NIPLEX-OBSIDIAN/MOCs/MOCs super.md", 51, 50, previous), false);
});

test("does not confuse different files with overlapping windows", () => {
	const previous = new Map([["a.md", [{ startLine: 1, endLine: 50 }]]]);
	assert.equal(readWindowOverlaps("b.md", 1, 50, previous), false);
});
