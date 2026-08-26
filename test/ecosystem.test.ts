import test from "node:test";
import assert from "node:assert/strict";
import { emptyEcosystemGrant, normalizeEcosystemContribution, permissionAllowsDataClass } from "../src/core/ecosystem";

test("ecosystem grants start fully disabled", () => {
	const grant = emptyEcosystemGrant();
	assert.equal(grant.boundedContext, false);
	assert.equal(grant.noteMetadata, false);
	assert.equal(grant.mapProvenance, false);
	assert.equal(grant.coarseActivity, false);
	assert.equal(grant.skillGuidance, false);
	assert.equal(grant.readOnlyActions, false);
});

test("permission checks map only their declared data classes", () => {
	const grant = { ...emptyEcosystemGrant(), noteMetadata: true, mapProvenance: true };
	assert.equal(permissionAllowsDataClass(grant, "note-metadata"), true);
	assert.equal(permissionAllowsDataClass(grant, "map-provenance"), true);
	assert.equal(permissionAllowsDataClass(grant, "coarse-activity"), false);
});

test("contributions are bounded and preserve provenance labels", () => {
	const request = { requestId: "test", purpose: "agent-turn" as const, query: "question", maxChars: 40, maxItems: 1, approvedDataClasses: ["note-metadata" as const] };
	const contribution = normalizeEcosystemContribution({
		extensionId: "niplex-research-brain",
		label: "Research Brain",
		text: "x".repeat(400),
		dataClasses: ["note-metadata"],
		provenance: [{ label: "Note", kind: "local-index", path: "Research/Note.md" }, { label: "Extra", kind: "local-index" }],
		truncated: false,
		generatedAt: Date.now(),
	}, request);
	assert.ok(contribution);
	assert.equal(contribution?.provenance.length, 1);
	assert.equal(contribution?.provenance[0]?.path, "Research/Note.md");
	assert.equal(contribution?.truncated, true);
	assert.ok((contribution?.text.length ?? 0) <= 40);
});

test("drops non-empty context when the host supplies a zero character budget", () => {
	const contribution = normalizeEcosystemContribution({
		extensionId: "niplex-research-brain",
		label: "Research Brain",
		text: "bounded note metadata",
		dataClasses: ["note-metadata"],
		provenance: [],
		truncated: false,
		generatedAt: Date.now(),
	}, { requestId: "zero", purpose: "agent-turn", query: "question", maxChars: 0, maxItems: 0, approvedDataClasses: [] });
	assert.equal(contribution, null);
});
