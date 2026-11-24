import { test } from "node:test";
import assert from "node:assert/strict";
import { keccak256, stringToHex } from "viem";
import { parseReceiptHeader, requestHash } from "./request";

const N = "0x" + "ab".repeat(32);

test("request hash is the documented string, method upper-cased, nonce lower-cased", () => {
  const h = requestHash(7, "get", "/api/provider/sample?topic=chain", N.toUpperCase().replace("0X", "0x"));
  assert.equal(h, keccak256(stringToHex(`gentpay-req-v1|7|GET|/api/provider/sample?topic=chain|${N}`)));
});

test("a different path, provider or nonce gives a different hash", () => {
  const a = requestHash(1, "GET", "/a", N);
  assert.notEqual(a, requestHash(1, "GET", "/b", N));
  assert.notEqual(a, requestHash(2, "GET", "/a", N));
  assert.notEqual(a, requestHash(1, "GET", "/a", "0x" + "cd".repeat(32)));
});

test("bad inputs are refused", () => {
  assert.throws(() => requestHash(1, "GET", "/a", "0x12"));
  assert.throws(() => requestHash(1, "GET", "a", N));
  assert.throws(() => requestHash(1, "GET;", "/a", N));
});

test("receipt header parses task:nonce only", () => {
  assert.deepEqual(parseReceiptHeader(`12:${N}`), { taskId: 12n, nonce: N });
  assert.equal(parseReceiptHeader("12"), null);
  assert.equal(parseReceiptHeader(`-1:${N}`), null);
  assert.equal(parseReceiptHeader(null), null);
});
