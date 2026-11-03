import { describe, expect, it } from "vitest";

import {
  createImageReferenceModelPricesForm,
  parseReferencePrice,
  referenceFamiliesForPlatform,
  referenceUnitPrice,
  serializeImageReferenceModelPrices,
} from "../groupsImageReferencePricing";

describe("groupsImageReferencePricing", () => {
  it("lists the NovelAI families on NovelAI and composite groups only", () => {
    expect(referenceFamiliesForPlatform("novelai").map((family) => family.key)).toEqual([
      "nai-diffusion-4-5",
      "nai-diffusion-5",
    ]);
    expect(referenceFamiliesForPlatform("composite")).toHaveLength(2);
    expect(referenceFamiliesForPlatform("openai")).toEqual([]);
  });

  it("resolves a unit price like the backend: family, then flat, then the model default", () => {
    expect(referenceUnitPrice("0.1", 0.02, 0.05)).toBe(0.1);
    expect(referenceUnitPrice(null, "0.02", 0.05)).toBe(0.02);
    expect(referenceUnitPrice("", null, 0.075)).toBe(0.075);
    expect(referenceUnitPrice(null, null, 0)).toBe(0);
    expect(parseReferencePrice("-1")).toBeNull();
    expect(parseReferencePrice("0.")).toBe(0);
  });

  it("serializes only configured prices and keeps families set outside the form", () => {
    const form = createImageReferenceModelPricesForm({ "gpt-image-2": 0.01 });
    form["nai-diffusion-5"] = "0.08";
    form["nai-diffusion-4-5"] = "";
    expect(serializeImageReferenceModelPrices(form)).toEqual({
      "gpt-image-2": 0.01,
      "nai-diffusion-5": 0.08,
    });
    expect(serializeImageReferenceModelPrices(createImageReferenceModelPricesForm())).toEqual({});
  });
});
