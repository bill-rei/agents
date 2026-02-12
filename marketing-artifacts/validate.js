const fs = require("fs");
const Ajv = require("ajv");
const addFormats = require("ajv-formats");
const schema = require("./schema");

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);

/**
 * Validate a marketing artifact object against the schema.
 * Returns { valid: true } or { valid: false, errors: string[] }.
 */
function validateArtifact(artifact) {
  const valid = validate(artifact);
  const errors = [];

  if (!valid) {
    for (const err of validate.errors) {
      const path = err.instancePath || "(root)";
      if (err.keyword === "required") {
        errors.push(`${path} is missing required field "${err.params.missingProperty}"`);
      } else if (err.keyword === "enum") {
        errors.push(`${path} must be one of: ${err.params.allowedValues.join(", ")}`);
      } else if (err.keyword === "const") {
        errors.push(`${path} must be "${err.params.allowedValue}"`);
      } else if (err.keyword === "additionalProperties") {
        errors.push(`${path} has unexpected field "${err.params.additionalProperty}"`);
      } else {
        errors.push(`${path} ${err.message}`);
      }
    }
  }

  // Business rules beyond JSON Schema
  if (
    artifact &&
    artifact.artifact_type === "social_post" &&
    artifact.target &&
    artifact.target.platform === "reddit"
  ) {
    if (artifact.content && artifact.content.cta) {
      errors.push('/content/cta is not allowed for Reddit posts (Reddit prohibits direct CTAs)');
    }
    if (!artifact.target.reddit_mode) {
      errors.push('/target is missing required field "reddit_mode" for Reddit posts');
    }
  }

  return errors.length ? { valid: false, errors } : { valid: true };
}

/**
 * Read a JSON file and validate it as a marketing artifact.
 * Returns { valid: true } or { valid: false, errors: string[] }.
 * Throws if the file cannot be read or parsed.
 */
function validateArtifactFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  let artifact;
  try {
    artifact = JSON.parse(raw);
  } catch (e) {
    return { valid: false, errors: [`Invalid JSON: ${e.message}`] };
  }
  return validateArtifact(artifact);
}

module.exports = { validateArtifact, validateArtifactFile };
