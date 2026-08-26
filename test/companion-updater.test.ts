import assert from "node:assert/strict";
import test from "node:test";
import { compareVersions, isReleaseNewer } from "../src/core/version-utils";

test("compares release versions numerically", () => {
	assert.equal(compareVersions("0.2.0", "0.1.9"), 1);
	assert.equal(compareVersions("v0.2.0", "0.2.0"), 0);
	assert.equal(compareVersions("0.1.10", "0.1.9"), 1);
	assert.equal(compareVersions("0.1.8", "0.1.9"), -1);
});

test("only treats a known higher release as an update", () => {
	assert.equal(isReleaseNewer("0.2.1", "0.2.0"), true);
	assert.equal(isReleaseNewer("0.2.0", "0.2.0"), false);
	assert.equal(isReleaseNewer("0.1.9", "0.2.0"), false);
	assert.equal(isReleaseNewer("0.2.1", undefined), false);
});
