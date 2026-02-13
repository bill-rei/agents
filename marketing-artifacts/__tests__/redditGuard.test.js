const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { checkRedditPolicy } = require("../../publishers/social/redditGuard");

const fixture = (name) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8"));

describe("redditGuard", () => {
  it("allows a valid discussion post ending with a question", () => {
    const result = checkRedditPolicy(fixture("valid-reddit-discussion.json"));
    assert.deepStrictEqual(result, { allowed: true });
  });

  it("blocks non-discussion reddit_mode", () => {
    const result = checkRedditPolicy(fixture("blocked-reddit-wrong-mode.json"));
    assert.strictEqual(result.allowed, false);
    assert.ok(
      result.reasons.some((r) => r.includes('reddit_mode must be "discussion"')),
      `expected mode error, got: ${result.reasons.join("; ")}`
    );
  });

  it("blocks promotional content with multiple violations", () => {
    const artifact = fixture("blocked-reddit-promotional.json");
    const result = checkRedditPolicy(artifact);
    assert.strictEqual(result.allowed, false);

    const joined = result.reasons.join("\n");
    // Should catch: cta (schema + guard), "check out" phrase, "sign up" phrase, link, media_urls, hashtags, brand x2
    assert.ok(joined.toLowerCase().includes("cta"), `expected cta error:\n${joined}`);
    assert.ok(joined.includes('"check out"'), `expected "check out" phrase error:\n${joined}`);
    assert.ok(joined.includes('"sign up"'), `expected "sign up" phrase error:\n${joined}`);
    assert.ok(joined.includes("contains a link"), `expected link error:\n${joined}`);
    assert.ok(joined.includes("media_urls"), `expected media_urls error:\n${joined}`);
    assert.ok(joined.includes("hashtags"), `expected hashtags error:\n${joined}`);
    assert.ok(joined.includes("brand"), `expected brand mention error:\n${joined}`);
  });

  it("blocks a post that does not end with a question", () => {
    const artifact = fixture("valid-reddit-discussion.json");
    // Mutate: remove trailing question
    artifact.content.body = "Sleep consistency matters more than total hours. I have been doing this for a month.";
    const result = checkRedditPolicy(artifact);
    assert.strictEqual(result.allowed, false);
    assert.ok(
      result.reasons.some((r) => r.includes("end with a question")),
      `expected question prompt error, got: ${result.reasons.join("; ")}`
    );
  });

  it("blocks a post with links in body even if otherwise clean", () => {
    const artifact = fixture("valid-reddit-discussion.json");
    artifact.content.body = "I found this study interesting: https://example.com/study — what do you think?";
    const result = checkRedditPolicy(artifact);
    assert.strictEqual(result.allowed, false);
    assert.ok(
      result.reasons.some((r) => r.includes("contains a link")),
      `expected link error, got: ${result.reasons.join("; ")}`
    );
  });

  it("allows a post with exactly one brand mention", () => {
    const artifact = fixture("valid-reddit-discussion.json");
    artifact.content.body = "At llif we have been looking into sleep research. What has worked for you?";
    const result = checkRedditPolicy(artifact);
    assert.deepStrictEqual(result, { allowed: true });
  });

  it("blocks a post with excessive brand mentions", () => {
    const artifact = fixture("valid-reddit-discussion.json");
    artifact.content.body = "LLIF has great research. LLIF also published a study. What do you think about LLIF?";
    const result = checkRedditPolicy(artifact);
    assert.strictEqual(result.allowed, false);
    assert.ok(
      result.reasons.some((r) => r.includes("brand") && r.includes("3 times")),
      `expected brand error, got: ${result.reasons.join("; ")}`
    );
  });
});
