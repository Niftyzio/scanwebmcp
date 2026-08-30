import { describe, expect, it } from "vitest";
import { slugify } from "./scan-service";

describe("result slugs", () => {
  it("keeps bare and www hosts distinct", () => {
    expect(slugify("example.com")).toBe("example.com");
    expect(slugify("www.example.com")).toBe("www.example.com");
  });
});
