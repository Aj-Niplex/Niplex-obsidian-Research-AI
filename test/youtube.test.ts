import assert from "node:assert/strict";
import test from "node:test";
import { extractYoutubeUrl } from "../src/core/youtube";

test("canonicalizes a standard YouTube watch URL", () => {
	assert.equal(extractYoutubeUrl("Summarize https://www.youtube.com/watch?v=abc123_XY9 please"), "https://www.youtube.com/watch?v=abc123_XY9");
});

test("canonicalizes a youtu.be URL and removes trailing punctuation", () => {
	assert.equal(extractYoutubeUrl("https://youtu.be/abc123_XY9?si=example."), "https://www.youtube.com/watch?v=abc123_XY9");
});

test("accepts shorts and live URLs", () => {
	assert.equal(extractYoutubeUrl("https://youtube.com/shorts/abc123_XY9"), "https://www.youtube.com/watch?v=abc123_XY9");
	assert.equal(extractYoutubeUrl("https://youtube.com/live/abc123_XY9"), "https://www.youtube.com/watch?v=abc123_XY9");
});

test("rejects non-YouTube URLs and malformed video IDs", () => {
	assert.equal(extractYoutubeUrl("https://example.com/watch?v=abc123_XY9"), null);
	assert.equal(extractYoutubeUrl("https://youtu.be/short"), null);
});
