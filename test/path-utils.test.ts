import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeVaultPath } from "../src/core/path-utils";

test("accepts a normal vault-relative markdown path", () => {
	assert.equal(sanitizeVaultPath("Research/2026/report.md"), "Research/2026/report.md");
});

test("rejects absolute, drive-letter, and empty paths", () => {
	for (const value of ["", "   ", "/.obsidian/app.json", "C:\\vault\\note.md"]) {
		assert.equal(sanitizeVaultPath(value), null, value);
	}
});

test("rejects traversal and ambiguous separator segments", () => {
	for (const value of ["../secret.md", "Research/../secret.md", "./note.md", "Research//note.md", "Research\\..\\secret.md"]) {
		assert.equal(sanitizeVaultPath(value), null, value);
	}
});

test("rejects null bytes", () => {
	assert.equal(sanitizeVaultPath("note\0.md"), null);
});
