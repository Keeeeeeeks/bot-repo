import { describe, it, expect } from "vitest";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import weights from "../src/feature-weights.json";
import schema from "../src/feature-weights.schema.json";
import { FEATURE_WEIGHTS } from "../src/index";

describe("feature-weights.json", () => {
  it("matches its JSON Schema", () => {
    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    expect(validate(weights)).toBe(true);
  });

  it("sum of weights equals normalization.max_raw", () => {
    const sum = FEATURE_WEIGHTS.features.reduce((a, f) => a + f.weight, 0);
    expect(sum).toBe(FEATURE_WEIGHTS.normalization.max_raw);
  });

  it("has no duplicate feature ids", () => {
    const ids = FEATURE_WEIGHTS.features.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
