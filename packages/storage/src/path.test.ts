import { describe, expect, it } from "vitest";
import {
  assertCompanyPath,
  assertCompanyPrefix,
  companyKey,
  companyPrefix,
  normalizeStorageKey,
  normalizeStoragePrefix
} from "./path";

describe("storage paths", () => {
  it("normalizes valid keys and prefixes", () => {
    expect(normalizeStorageKey("company-a/documents/file.txt")).toBe(
      "company-a/documents/file.txt"
    );
    expect(normalizeStoragePrefix("/documents/nested/")).toBe(
      "documents/nested/"
    );
  });

  it("rejects traversal and ambiguous key segments", () => {
    for (const key of [
      "",
      "/company-a/file.txt",
      "company-a",
      "company-a/../file.txt",
      "company-a/%2e%2e/file.txt",
      "company-a/documents%2ffile.txt",
      "company-a/documents\\file.txt",
      "company-a/documents/file.txt?download=1",
      "company-a/documents/file.txt#section",
      "company-a/documents/\u0000file.txt"
    ]) {
      expect(() => assertCompanyPath("company-a", key), key).toThrow();
    }
  });

  it("blocks cross-tenant object and prefix access", () => {
    expect(() =>
      assertCompanyPath("company-a", "company-b/documents/file.txt")
    ).toThrow("Cross-tenant storage access blocked");
    expect(() =>
      assertCompanyPrefix("company-a", "company-b/documents")
    ).toThrow("Cross-tenant storage access blocked");
  });

  it("prefixes company object paths and list prefixes", () => {
    expect(companyKey("company-a", "documents/file.txt")).toBe(
      "company-a/documents/file.txt"
    );
    expect(companyKey("company-a", "company-a/documents/file.txt")).toBe(
      "company-a/documents/file.txt"
    );
    expect(companyPrefix("company-a", "")).toBe("company-a/");
    expect(companyPrefix("company-a", "documents")).toBe(
      "company-a/documents/"
    );
    expect(companyPrefix("company-a", "company-a/documents/")).toBe(
      "company-a/documents/"
    );
  });
});
