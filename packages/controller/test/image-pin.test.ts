import { test } from "node:test";
import assert from "node:assert/strict";
import {
  composePicker,
  imageExists,
  matchImage,
  pinCompose,
  registryParts,
  resolveImages,
  snapshotImages,
  versionRows,
} from "../src/lib/image-pin";

const GITLAB = "gitlab/gitlab-ce@sha256:182613a8aaaabbbbccccddddeeeeffff00001111222233334444555566667777";

const compose = `# GitLab
services:
  gitlab:
    image: 'gitlab/gitlab-ce:latest' # pinned by CBM?
    environment:
      - SERVICE_URL_GITLAB_80
    volumes:
      - gitlab-config:/etc/gitlab
  redis:
    image: redis:7.2
    command: ["redis-server"]
  worker:
    build: .
volumes:
  gitlab-config:
    image: not-a-service-image
`;

test("a compose clone runs each image at the digest it ran, keeping the file as written", async () => {
  const images = [
    { service: "gitlab", ref: "gitlab/gitlab-ce:latest", digest: GITLAB, version: "18.2.0-ce.0" },
    { service: "redis", ref: "redis:7.2", digest: "redis@sha256:1234" },
  ];
  const resolved = await resolveImages(images, async () => true);
  const { compose: out, changes } = pinCompose(compose, composePicker(resolved));
  assert.deepEqual(changes, [
    { service: "gitlab", from: "gitlab/gitlab-ce:latest", to: GITLAB },
    { service: "redis", from: "redis:7.2", to: "redis@sha256:1234" },
  ]);
  assert.match(out, new RegExp(`    image: '${GITLAB.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}' # pinned by CBM\\?`));
  assert.match(out, /    image: redis@sha256:1234\n/);
  assert.match(out, /    image: not-a-service-image/); // top-level volumes block untouched
  assert.match(out, /^# GitLab\nservices:/);
  // "Version as written" changes nothing.
  assert.equal(pinCompose(compose, () => undefined).compose, compose);
});

test("a snapshot from before 2.4.6 (primary image only) still pins by reference", () => {
  const images = snapshotImages({ imageRef: "gitlab/gitlab-ce:latest", imageDigest: GITLAB });
  assert.deepEqual(images, [{ ref: "gitlab/gitlab-ce:latest", digest: GITLAB }]);
  assert.equal(matchImage(images, "gitlab", "gitlab/gitlab-ce:latest"), images[0]);
  assert.equal(matchImage(images, "gitlab", "docker.io/gitlab/gitlab-ce"), images[0]); // same image, other spelling
  assert.equal(matchImage(images, "redis", "redis:7.2"), undefined);
  // A local image id is no digest to pin.
  assert.deepEqual(snapshotImages({ imageRef: "abc:123", imageDigest: "sha256:local" }), [{ ref: "abc:123", digest: undefined }]);
});

test("an image the registry dropped falls back to its version tag, else to the reference as written", async () => {
  const gone = new Set([GITLAB, "redis@sha256:1234", "redis:7.2.4"]);
  const exists = async (ref: string) => !gone.has(ref);
  const [gitlab, redis, unknown] = await resolveImages(
    [
      { service: "gitlab", ref: "gitlab/gitlab-ce:latest", digest: GITLAB, version: "18.2.0-ce.0" },
      { service: "redis", ref: "redis:7.2", digest: "redis@sha256:1234", version: "7.2.4" },
      { service: "x", ref: "reg.local:5000/x:latest", digest: "reg.local:5000/x@sha256:9" },
    ],
    async (ref) => (ref.startsWith("reg.local") ? undefined : exists(ref)),
  );
  assert.equal(gitlab.use, "gitlab/gitlab-ce:18.2.0-ce.0");
  assert.match(gitlab.note!, /no longer in its registry/);
  assert.equal(redis.use, "redis:7.2");
  assert.match(redis.note!, /keeping redis:7.2/);
  assert.equal(unknown.use, "reg.local:5000/x@sha256:9"); // can't tell: keep the digest
  assert.equal(unknown.note, undefined);
});

test("registry coordinates follow docker pull's rules", () => {
  assert.deepEqual(registryParts("postgres:16"), { host: "registry-1.docker.io", repo: "library/postgres", reference: "16" });
  assert.deepEqual(registryParts(GITLAB), { host: "registry-1.docker.io", repo: "gitlab/gitlab-ce", reference: GITLAB.split("@")[1] });
  assert.deepEqual(registryParts("ghcr.io/holo795/cbm-agent"), { host: "ghcr.io", repo: "holo795/cbm-agent", reference: "latest" });
  assert.deepEqual(registryParts("localhost:5000/a/b:1"), { host: "localhost:5000", repo: "a/b", reference: "1" });
});

test("the registry check fetches an anonymous token, and only a 404 means gone", async () => {
  const calls: string[] = [];
  const fake = (status: number) =>
    (async (url: string | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(url)}`);
      if (String(url).startsWith("https://auth.example/token")) return new Response(JSON.stringify({ token: "t" }));
      const auth = (init?.headers as Record<string, string>)?.authorization;
      if (!auth)
        return new Response(null, {
          status: 401,
          headers: { "www-authenticate": 'Bearer realm="https://auth.example/token",service="reg"' },
        });
      return new Response(null, { status });
    }) as typeof fetch;
  assert.equal(await imageExists(GITLAB, fake(200)), true);
  assert.match(calls[1], /scope=repository%3Agitlab%2Fgitlab-ce%3Apull/);
  assert.equal(await imageExists(GITLAB, fake(404)), false);
  assert.equal(await imageExists(GITLAB, fake(429)), undefined);
  const down = (async () => {
    throw new Error("ENOTFOUND");
  }) as typeof fetch;
  assert.equal(await imageExists(GITLAB, down), undefined);
});

test("the dialog says whether each container still runs the snapshot's image", () => {
  const images = [
    { service: "gitlab", ref: "gitlab/gitlab-ce:latest", digest: GITLAB, id: "sha256:old", version: "18.2.0" },
    { service: "redis", ref: "redis:7.2", id: "sha256:r" },
    { service: "web", ref: "nginx:1", id: "sha256:n" },
  ];
  const rows = versionRows(images, [
    { name: "gitlab-x", service: "gitlab", imageId: "sha256:new" },
    { name: "redis-x", service: "redis", imageId: "sha256:r" },
  ]);
  assert.deepEqual(
    rows.map((r) => [r.name, r.running]),
    [
      ["gitlab", "different"],
      ["redis", "same"],
      ["web", undefined],
    ],
  );
});

test("replicas of one service show as one row", () => {
  const img = { service: "worker", ref: "app:1", digest: "app@sha256:1" };
  assert.equal(versionRows([{ ...img, container: "w-1" }, { ...img, container: "w-2" }], null).length, 1);
});
