import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getTemplateId, listTemplates, isAllowedCampaignType } from "../src/lib/templates/registry";

describe("getTemplateId", () => {
  it("returns LLIF use_case template", () => {
    assert.strictEqual(getTemplateId("llif", "use_case"), 1111);
  });

  it("returns BestLife feature template", () => {
    assert.strictEqual(getTemplateId("bestlife", "feature"), 2222);
  });

  it("returns correct template for every brand+type combination", () => {
    const templates = listTemplates();
    assert.strictEqual(templates.length, 10); // 5 types × 2 brands
    for (const t of templates) {
      const id = getTemplateId(t.brand, t.campaignType);
      assert.strictEqual(id, t.templateId);
    }
  });

  it("throws for invalid campaign type", () => {
    assert.throws(
      () => getTemplateId("llif", "webinar" as never),
      /not allowed/
    );
  });
});

describe("isAllowedCampaignType", () => {
  it("returns true for valid combinations", () => {
    assert.ok(isAllowedCampaignType("llif", "use_case"));
    assert.ok(isAllowedCampaignType("bestlife", "thematic"));
  });

  it("returns false for unknown types", () => {
    assert.ok(!isAllowedCampaignType("llif", "webinar"));
    assert.ok(!isAllowedCampaignType("bestlife", "blog"));
  });
});
