/**
 * Verifies the local-pair-client URL normaliser and the typed
 * PairClientError details filter. Both are pure functions that the
 * pair flow leans on heavily.
 *
 * @license GPL-3.0-only
 */

import { describe, it, expect } from "vitest";
import {
  normaliseHost,
  PairClientError,
} from "@/lib/agent/local-pair-client";

describe("normaliseHost", () => {
  it("appends http:// and :8080 to a bare hostname", () => {
    expect(normaliseHost("skynode.local")).toBe("http://skynode.local:8080");
  });

  it("appends :8080 to an http://host without a port", () => {
    expect(normaliseHost("http://skynode.local")).toBe(
      "http://skynode.local:8080",
    );
  });

  it("preserves an explicit non-8080 port on http", () => {
    expect(normaliseHost("http://skynode.local:9999")).toBe(
      "http://skynode.local:9999",
    );
  });

  it("leaves https URLs alone (does NOT force :8080 onto TLS)", () => {
    // normaliseHost strips trailing slashes, so the URL constructor's
    // canonicalised "https://host/" comes back as "https://host".
    expect(normaliseHost("https://drone.example.com")).toBe(
      "https://drone.example.com",
    );
    expect(normaliseHost("https://drone.example.com:8443")).toBe(
      "https://drone.example.com:8443",
    );
  });

  it("strips trailing slashes", () => {
    expect(normaliseHost("http://skynode.local:8080/")).toBe(
      "http://skynode.local:8080",
    );
    expect(normaliseHost("http://skynode.local:8080///")).toBe(
      "http://skynode.local:8080",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(normaliseHost("  skynode.local  ")).toBe("http://skynode.local:8080");
  });

  it("returns empty string for empty input", () => {
    expect(normaliseHost("")).toBe("");
    expect(normaliseHost("   ")).toBe("");
  });

  it("preserves a numeric IP host", () => {
    expect(normaliseHost("192.168.1.42")).toBe("http://192.168.1.42:8080");
  });
});

describe("PairClientError", () => {
  it("carries code + message", () => {
    const e = new PairClientError("probeFailedStatusError", "Probe failed: 404");
    expect(e.code).toBe("probeFailedStatusError");
    expect(e.message).toBe("Probe failed: 404");
    expect(e.name).toBe("PairClientError");
  });

  it("filters object-valued details to JSON strings", () => {
    const e = new PairClientError("x", "x", {
      status: 500,
      statusText: "Internal",
      nested: { a: 1 },
    });
    expect(e.details).toEqual({
      status: 500,
      statusText: "Internal",
      nested: JSON.stringify({ a: 1 }),
    });
  });

  it("coerces null and undefined details to empty strings", () => {
    const e = new PairClientError("x", "x", {
      keep: "ok",
      drop: null,
    });
    expect(e.details.keep).toBe("ok");
    expect(e.details.drop).toBe("");
  });

  it("accepts an empty details bag", () => {
    const e = new PairClientError("enterHostnameError", "Enter a host");
    expect(e.details).toEqual({});
  });
});
