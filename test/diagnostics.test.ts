import assert from "node:assert/strict";
import test from "node:test";
import { DiagnosticsStore, createDiagnosticEntry, redactDiagnosticText } from "../src/core/diagnostics";

test("redacts keys and vault paths from diagnostics", () => {
const text = redactDiagnosticText("Authorization: Bearer secret-value failed while reading Projects/Private.md");
assert.doesNotMatch(text, /secret-value/);
assert.doesNotMatch(text, /Projects\/Private\.md/);
assert.match(text, /redacted/);
});

test("keeps shared diagnostics bounded and excludes response content", () => {
const store = new DiagnosticsStore();
store.record(createDiagnosticEntry("error", "provider-request-failed", "A short error"));
const output = store.formatForShare();
assert.match(output, /provider-request-failed/);
assert.doesNotMatch(output, /the entire note body|User asked to reveal|assistant response payload/i);
assert.equal(store.list().length, 1);
});
