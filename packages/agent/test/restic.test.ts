import { test } from "node:test";
import assert from "node:assert/strict";
import { resticS3Endpoint } from "../src/restic.js";

test("restic S3 endpoint keeps the configured scheme", () => {
  assert.equal(resticS3Endpoint("http://minio:9000"), "http://minio:9000");
  assert.equal(resticS3Endpoint("https://s3.example.com/"), "https://s3.example.com");
  assert.equal(resticS3Endpoint("s3.example.com"), "https://s3.example.com");
  assert.equal(resticS3Endpoint(undefined), "s3.amazonaws.com");
});
