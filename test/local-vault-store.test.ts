import assert from "node:assert/strict";
import test from "node:test";
import { parseReadableChat } from "../src/core/readable-chat";

test("reconstructs assistant answers and safe activity from readable chat Markdown", () => {
	const parsed = parseReadableChat(`---
id: chat-example
title: "Vault Purpose Summary"
subject: "Vault Purpose Summary"
updated: 123
---

# Vault Purpose Summary

## You

Summarize the purpose of this vault

## Agent

The vault is a structured knowledge system.

## Activity summary

- Used read_file_chunk: Read the bounded MOC index
- Prepared the final answer
`);
	assert.ok(parsed);
	assert.deepEqual(parsed.messages, [
		{ role: "user", content: "Summarize the purpose of this vault" },
		{ role: "assistant", content: "The vault is a structured knowledge system." },
	]);
	assert.deepEqual(parsed.activity, ["Used read_file_chunk: Read the bounded MOC index", "Prepared the final answer"]);
});
