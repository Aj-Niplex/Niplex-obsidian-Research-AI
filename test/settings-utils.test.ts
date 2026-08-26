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
	assert.equal(settings.mocLocationConfigured, false);
	assert.equal(settings.onboardingCompleted, false);
});

test("normalizes MOC time budget and checkpoint state", () => {
	const settings = normalizeAgentSettings({
		mocTimeBudgetSeconds: 9999,
		mocCheckpoint: {
			mode: "create",
			rootPath: " MOCs ",
			onlyPath: "",
			processedPaths: ["A.md", 4],
			categories: [{ name: "Goals", description: "x", reason: "y", notes: ["A.md", 4] }],
			errors: ["x"],
			updatedAt: Date.now(),
		},
	});
	assert.equal(settings.mocTimeBudgetSeconds, 900);
	assert.equal(settings.mocCheckpoint?.rootPath, "MOCs");
	assert.deepEqual(settings.mocCheckpoint?.processedPaths, ["A.md"]);
	assert.deepEqual(settings.mocCheckpoint?.categories[0]?.notes, ["A.md"]);
});

test("normalizes fallback order and clamps onboarding state", () => {
	const settings = normalizeAgentSettings({ geminiFallbackModels: [" gemini-a ", "gemini-a", 5, ""], onboardingVersion: 99, maxReadLines: 1 });
	assert.deepEqual(settings.geminiFallbackModels, ["gemini-a"]);
	assert.equal(settings.onboardingVersion, 99);
	assert.equal(settings.onboardingCompleted, true);
	assert.equal(settings.maxReadLines, 20);
});

test("keeps a fresh install incomplete until walkthrough completion is saved", () => {
	assert.equal(normalizeAgentSettings({}).onboardingCompleted, false);
	assert.equal(normalizeAgentSettings({ onboardingVersion: 4 }).onboardingCompleted, true);
	assert.equal(normalizeAgentSettings({ onboardingCompleted: true }).onboardingCompleted, true);
});

test("normalizes the output-size preference", () => {
	assert.equal(normalizeAgentSettings({ outputSize: "maximum" }).outputSize, "maximum");
	assert.equal(normalizeAgentSettings({ outputSize: "unsupported" }).outputSize, "standard");
});

test("normalizes the chat-window size preference", () => {
	assert.equal(normalizeAgentSettings({ windowSize: "spacious" }).windowSize, "spacious");
	assert.equal(normalizeAgentSettings({ windowSize: "compact" }).windowSize, "compact");
	assert.equal(normalizeAgentSettings({ windowSize: "unsupported" }).windowSize, "comfortable");
	assert.equal(normalizeAgentSettings({}).windowSize, "comfortable");
});

test("defaults companion reminders and restart checks safely", () => {
	const fresh = normalizeAgentSettings({});
	assert.equal(fresh.companionRemindersEnabled, true);
	assert.equal(fresh.companionUpdateChecksEnabled, true);
	assert.equal(fresh.companionSetupConfirmed, false);
	assert.equal(fresh.lastCompanionReminderAt, 0);
	assert.equal(fresh.lastCompanionUpdateCheckAt, 0);
	const migrated = normalizeAgentSettings({ companionRemindersEnabled: false, companionUpdateChecksEnabled: false, companionSetupConfirmed: true, lastCompanionReminderAt: -50, lastCompanionUpdateCheckAt: Number.POSITIVE_INFINITY });
	assert.equal(migrated.companionRemindersEnabled, false);
	assert.equal(migrated.companionUpdateChecksEnabled, false);
	assert.equal(migrated.companionSetupConfirmed, true);
	assert.equal(migrated.lastCompanionReminderAt, 0);
	assert.equal(migrated.lastCompanionUpdateCheckAt, 0);
});

test("keeps the quick-action bar to three valid icons and defaults legacy mode to chat", () => {
	const settings = normalizeAgentSettings({
		quickActions: ["moc", "history", "logs", "attach", "moc", "unknown"],
		researchMode: "unsupported",
	});
	assert.deepEqual(settings.quickActions, ["moc", "history", "logs"]);
	assert.equal(settings.researchMode, "chat");
});

test("preserves an explicit plan or create-and-edit mode", () => {
	assert.equal(normalizeAgentSettings({ researchMode: "plan" }).researchMode, "plan");
	assert.equal(normalizeAgentSettings({ researchMode: "edit" }).researchMode, "edit");
});
