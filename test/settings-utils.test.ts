import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAgentSettings } from "../src/core/settings-utils";

test("migrates legacy settings without losing safe defaults", () => {
	const settings = normalizeAgentSettings({ provider: "agnes", agnesModel: " agnes-2.5-flash ", maxIterations: 999, activeMocPath: " MOCs/MOCs super.md " });
	assert.equal(settings.provider, "agnes");
	assert.equal(settings.agnesModel, "agnes-2.5-flash");
	assert.equal(settings.maxIterations, 30);
	assert.deepEqual(settings.geminiFallbackModels, []);
	assert.deepEqual(settings.agnesFallbackModels, []);
	assert.equal(settings.autoFallbackOnRateLimit, true);
	assert.equal(settings.activeMocPath, "MOCs/MOCs super.md");
	assert.equal(settings.onboardingVersion, 0);
});

test("normalizes fallback order and clamps onboarding state", () => {
	const settings = normalizeAgentSettings({ geminiFallbackModels: [" gemini-a ", "gemini-a", 5, ""], onboardingVersion: 99, maxReadLines: 1 });
	assert.deepEqual(settings.geminiFallbackModels, ["gemini-a"]);
	assert.equal(settings.onboardingVersion, 99);
	assert.equal(settings.maxReadLines, 20);
});
