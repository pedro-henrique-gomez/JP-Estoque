// Pure helper tests do not replace the real pg_dump / pg_restore drill.
// @vitest-environment node
import { it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import {
  encryptArchive,
  decryptArchive,
} from "../scripts/operations/archive.mjs";
import { operationEvent } from "../scripts/operations/events.mjs";
it("encrypted archive round-trips without plaintext in its envelope", () => {
  const key = randomBytes(32),
    data = Buffer.from("fictitious auth and inventory");
  const a = encryptArchive(data, key);
  expect(JSON.stringify(a)).not.toContain(data.toString());
  expect(decryptArchive(a, key)).toEqual(data);
});
it("wrong archive key is denied", () => {
  const a = encryptArchive(Buffer.from("fake"), randomBytes(32));
  expect(() => decryptArchive(a, randomBytes(32))).toThrow();
});
it("modified authenticated ciphertext is denied", () => {
  const key = randomBytes(32),
    a = encryptArchive(Buffer.from("fake"), key);
  a.data = (a.data.startsWith("A") ? "B" : "A") + a.data.slice(1);
  expect(() => decryptArchive(a, key)).toThrow();
});
it("archive version and nonce are validated", () => {
  const key = randomBytes(32),
    a = encryptArchive(Buffer.from("fake"), key);
  expect(() => decryptArchive({ ...a, version: 2 }, key)).toThrow();
  expect(() => decryptArchive({ ...a, iv: "AA==" }, key)).toThrow();
});
it("telemetry accepts only bounded metric fields", () => {
  const event = operationEvent("restore", 12.3, "passed");
  expect(Object.keys(event).sort()).toEqual([
    "at",
    "durationMs",
    "event",
    "status",
  ]);
  expect(Object.isFrozen(event)).toBe(true);
});
it("telemetry rejects arbitrary payloads and invalid durations", () => {
  expect(() => operationEvent("password=secret", 1, "passed")).toThrow();
  expect(() => operationEvent("auth", NaN, "passed")).toThrow();
  expect(() => operationEvent("auth", 1, "token")).toThrow();
});
