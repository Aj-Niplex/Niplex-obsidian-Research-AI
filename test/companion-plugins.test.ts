import assert from "node:assert/strict";
import test from "node:test";
import { getCompanionDefinition, isCompanionVersionCurrent } from "../src/core/companion-plugins";

test("defines the Skills Helper as recommended and Iconize as optional", () => {
	assert.equal(getCompanionDefinition("niplex-skills-helper")?.required, true);
	assert.equal(getCompanionDefinition("obsidian-icon-folder")?.required, false);
});

test("accepts the expected helper version and newer versions", () => {
	assert.equal(isCompanionVersionCurrent("0.1.3", "0.1.3"), true);
	assert.equal(isCompanionVersionCurrent("0.1.4", "0.1.3"), true);
	assert.equal(isCompanionVersionCurrent("0.1.2", "0.1.3"), false);
	assert.equal(isCompanionVersionCurrent(undefined, "0.1.3"), false);
});
