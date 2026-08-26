import assert from "node:assert/strict";
import test from "node:test";
import { getCompanionDefinition, isCompanionVersionCurrent } from "../src/core/companion-plugins";

test("defines the helper as required and ecosystem extensions as optional", () => {
	assert.equal(getCompanionDefinition("niplex-skills-helper")?.required, true);
	assert.equal(getCompanionDefinition("obsidian-icon-folder")?.required, false);
	assert.equal(getCompanionDefinition("niplex-research-brain")?.required, false);
	assert.equal(getCompanionDefinition("niplex-writing-insights")?.required, false);
});

test("accepts the expected helper version and newer versions", () => {
	assert.equal(isCompanionVersionCurrent("0.2.0", "0.2.0"), true);
	assert.equal(isCompanionVersionCurrent("0.2.1", "0.2.0"), true);
	assert.equal(isCompanionVersionCurrent("0.1.9", "0.2.0"), false);
	assert.equal(isCompanionVersionCurrent(undefined, "0.2.0"), false);
});
