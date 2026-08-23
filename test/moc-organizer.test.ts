import assert from "node:assert/strict";
import test from "node:test";
import { MocOrganizer } from "../src/core/moc-organizer";
import type { NoteForCategorization, VaultContext } from "../src/core/vault-context";
import type { ProviderAdapter, ProviderRequest, ProviderResponse, ToolResult } from "../src/core/types";

const notes: NoteForCategorization[] = [
	{ path: "Journal/First.md", modified: 2, bytes: 100, properties: { type: "reflection" }, excerpt: "A note about relationships and long-term priorities." },
	{ path: "Projects/Second.md", modified: 1, bytes: 100, properties: { type: "project" }, excerpt: "A project connected to long-term priorities." },
];

class FakeProvider implements ProviderAdapter {
	readonly id = "gemini" as const;
	calls = 0;

	async complete(request: ProviderRequest): Promise<ProviderResponse> {
		this.calls += 1;
		const prompt = request.messages[1]?.content ?? "";
		if (prompt.includes("Suggest up to eight")) {
			return { text: '{"combinations":[{"categories":["Love","Goals"],"reason":"Use both for relationship and priority questions."}]}', toolCalls: [] };
		}
		if (prompt.includes("Journal/First.md")) {
			return { text: '{"categories":[{"name":"Love","description":"Notes about relationships and care.","reason":"The excerpt discusses relationships."},{"name":"Goals","description":"Notes about active priorities.","reason":"The excerpt discusses long-term priorities."}]}', toolCalls: [] };
		}
		return { text: '{"categories":[{"name":"Goals","description":"Notes about active priorities.","reason":"The excerpt discusses long-term priorities."}]}', toolCalls: [] };
	}
}

test("builds described multi-membership category MOCs incrementally", async () => {
	const writes = new Map<string, string>();
	const fakeVault = {
		getNotesForCategorization: async (limit: number, onlyPath = ""): Promise<NoteForCategorization[]> => onlyPath ? notes.filter((note) => note.path === onlyPath).slice(0, limit) : notes.slice(0, limit),
		writeGeneratedNote: async (path: string, content: string): Promise<ToolResult> => {
			writes.set(path, content);
			return { ok: true, content: `Created ${path}` };
		},
	} as unknown as VaultContext;
	const provider = new FakeProvider();
	const organizer = new MocOrganizer(provider, "test-model", fakeVault);
	const progress = [] as string[];
	const result = await organizer.build("create", "MOCs", 2, (event) => progress.push(event.phase));

	assert.equal(result.ok, true);
	assert.equal(result.notesProcessed, 2);
	assert.equal(result.categories, 2);
	assert.equal(provider.calls, 3);
	assert.ok(writes.has("MOCs/Love.md"));
	assert.ok(writes.has("MOCs/Goals.md"));
	assert.ok(writes.has("MOCs/MOCs super.md"));
	assert.match(writes.get("MOCs/Love.md") ?? "", /What belongs here/);
	assert.match(writes.get("MOCs/Goals.md") ?? "", /Journal\/First\]\]/);
	assert.match(writes.get("MOCs/Goals.md") ?? "", /Projects\/Second\]\]/);
	assert.match(writes.get("MOCs/MOCs super.md") ?? "", /Recommended starting sets/);
	assert.match(writes.get("MOCs/MOCs super.md") ?? "", /relationship and priority questions/);
	assert.ok(progress.includes("reading"));
	assert.ok(progress.includes("classifying"));
	assert.ok(progress.includes("writing"));
	assert.ok(progress.includes("complete"));
});

test("processes all eligible notes when the create limit is zero", async () => {
	const writes = new Map<string, string>();
	const fakeVault = {
		getNotesForCategorization: async (limit: number): Promise<NoteForCategorization[]> => limit === 0 ? notes : notes.slice(0, limit),
		writeGeneratedNote: async (path: string, content: string): Promise<ToolResult> => {
			writes.set(path, content);
			return { ok: true, content: `Created ${path}` };
		},
	} as unknown as VaultContext;
	const organizer = new MocOrganizer(new FakeProvider(), "test-model", fakeVault);
	const result = await organizer.build("create", "MOCs", 0, () => undefined);
	assert.equal(result.ok, true);
	assert.equal(result.notesProcessed, notes.length);
	assert.match(writes.get("MOCs/Goals.md") ?? "", /Projects\/Second\]\]/);
});
