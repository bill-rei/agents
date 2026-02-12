const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { validateArtifact, validateArtifactFile } = require("../index");

const fixture = (name) =>
  path.join(__dirname, "fixtures", name);

describe("validateArtifact", () => {
  it("accepts a valid web_page staging artifact", () => {
    const result = validateArtifactFile(fixture("valid-web-page.json"));
    assert.deepStrictEqual(result, { valid: true });
  });

  it("accepts a valid linkedin scheduled artifact", () => {
    const result = validateArtifactFile(fixture("valid-linkedin-scheduled.json"));
    assert.deepStrictEqual(result, { valid: true });
  });

  it("rejects an invalid reddit artifact (has CTA, missing reddit_mode)", () => {
    const result = validateArtifactFile(fixture("invalid-reddit.json"));
    assert.strictEqual(result.valid, false);

    const joined = result.errors.join("\n");
    assert.ok(
      joined.includes("cta") && joined.toLowerCase().includes("reddit"),
      `expected CTA error for Reddit, got:\n${joined}`
    );
    assert.ok(
      joined.includes("reddit_mode"),
      `expected reddit_mode error, got:\n${joined}`
    );
  });

  it("returns errors for a completely empty object", () => {
    const result = validateArtifact({});
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.length >= 7, "should flag all 7 required fields");
  });

  it("returns invalid-JSON error for malformed file", () => {
    const result = validateArtifactFile(
      path.join(__dirname, "fixtures", "..", "..", "package.json")
    );
    // package.json is valid JSON but not a valid artifact
    assert.strictEqual(result.valid, false);
  });
});
