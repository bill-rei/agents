const webPageTarget = {
  type: "object",
  properties: {
    platform: { type: "string", const: "wordpress" },
    site_key: { type: "string", enum: ["llif-staging", "bestlife-staging"] },
    slug: { type: "string", minLength: 1 },
    page_id: { type: "integer", minimum: 1 },
    elementor: { type: "boolean" },
  },
  required: ["platform", "site_key"],
  additionalProperties: false,
};

const socialPostTarget = {
  type: "object",
  properties: {
    platform: { type: "string", enum: ["x", "linkedin", "reddit", "facebook", "instagram"] },
    reddit_mode: {
      type: "string",
      enum: ["discussion", "value_first", "ama"],
    },
  },
  required: ["platform"],
  additionalProperties: false,
};

const blogPostTarget = {
  type: "object",
  properties: {
    platform: { type: "string", minLength: 1 },
    category: { type: "string" },
  },
  required: ["platform"],
  additionalProperties: false,
};

const webPageContent = {
  type: "object",
  properties: {
    title: { type: "string", minLength: 1 },
    html: { type: "string", minLength: 1 },
    status: { type: "string", enum: ["draft", "publish"] },
  },
  required: ["title", "html"],
  additionalProperties: false,
};

const socialPostContent = {
  type: "object",
  properties: {
    body: { type: "string", minLength: 1 },
    hashtags: { type: "array", items: { type: "string" } },
    cta: { type: "string" },
    media_urls: { type: "array", items: { type: "string", format: "uri" } },
  },
  required: ["body"],
  additionalProperties: false,
};

const blogPostContent = {
  type: "object",
  properties: {
    title: { type: "string", minLength: 1 },
    markdown: { type: "string", minLength: 1 },
    excerpt: { type: "string" },
  },
  required: ["title", "markdown"],
  additionalProperties: false,
};

const provenance = {
  type: "object",
  properties: {
    agent: { type: "string", minLength: 1 },
    created_at: { type: "string", format: "date-time" },
    session_id: { type: "string" },
  },
  required: ["agent", "created_at"],
  additionalProperties: false,
};

const artifactSchema = {
  type: "object",
  properties: {
    artifact_id: { type: "string", minLength: 1 },
    brand: { type: "string", minLength: 1 },
    artifact_type: {
      type: "string",
      enum: ["web_page", "social_post", "blog_post"],
    },
    target: {},
    content: {},
    status: {
      type: "string",
      enum: ["draft", "review", "approved", "published", "rejected"],
    },
    provenance,
    schedule_at: { type: "string", format: "date-time" },
    constraints: { type: "array", items: { type: "string" } },
    review_notes: { type: "string" },
    human_approval: { type: "boolean" },
    metadata: { type: "object" },
  },
  required: [
    "artifact_id",
    "brand",
    "artifact_type",
    "target",
    "content",
    "status",
    "provenance",
  ],
  additionalProperties: false,
  allOf: [
    {
      if: { properties: { artifact_type: { const: "web_page" } } },
      then: {
        properties: { target: webPageTarget, content: webPageContent },
      },
    },
    {
      if: { properties: { artifact_type: { const: "social_post" } } },
      then: {
        properties: { target: socialPostTarget, content: socialPostContent },
      },
    },
    {
      if: { properties: { artifact_type: { const: "blog_post" } } },
      then: {
        properties: { target: blogPostTarget, content: blogPostContent },
      },
    },
  ],
};

module.exports = artifactSchema;
