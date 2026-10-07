import { test } from "node:test";
import assert from "node:assert/strict";
import { imageRepo, imageTag, imageVersion, isFloatingImage, pickRepoDigest } from "./images.js";

test("image references compare by repository, Docker Hub prefixes aside", () => {
  assert.equal(imageRepo("docker.io/library/postgres:16"), "postgres");
  assert.equal(imageRepo("postgres@sha256:abc"), "postgres");
  assert.equal(imageRepo("reg.example.com:5000/team/app:1.2"), "reg.example.com:5000/team/app");
  assert.equal(imageTag("gitlab/gitlab-ce"), "latest");
  assert.equal(imageTag("reg:5000/a/b"), "latest");
  assert.equal(imageTag("a/b@sha256:abc"), undefined);
  assert.equal(isFloatingImage("gitlab/gitlab-ce:latest"), true);
  assert.equal(isFloatingImage("gitlab/gitlab-ce:18.2.0-ce.0"), false);
});

test("the digest kept is the one of the repository the container was started from", () => {
  const digests = ["mirror.local/gitlab-ce@sha256:111", "gitlab/gitlab-ce@sha256:222"];
  assert.equal(pickRepoDigest(digests, "gitlab/gitlab-ce:latest"), "gitlab/gitlab-ce@sha256:222");
  assert.equal(pickRepoDigest(digests, "other:1"), "mirror.local/gitlab-ce@sha256:111");
  assert.equal(pickRepoDigest([], "x"), undefined);
});

test("a version comes from the image's label, else a fixed tag it carries, else a fixed reference", () => {
  assert.equal(imageVersion({ "org.opencontainers.image.version": "18.2.0" }, [], "gitlab/gitlab-ce:latest"), "18.2.0");
  assert.equal(
    imageVersion({}, ["gitlab/gitlab-ce:latest", "gitlab/gitlab-ce:18.2.0-ce.0"], "gitlab/gitlab-ce:latest"),
    "18.2.0-ce.0",
  );
  assert.equal(imageVersion({}, ["gitlab/gitlab-ce:latest"], "gitlab/gitlab-ce:latest"), undefined);
  assert.equal(imageVersion(undefined, undefined, "postgres:16.4"), "16.4");
});
