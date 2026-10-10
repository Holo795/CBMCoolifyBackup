import { once } from "node:events";
import { PassThrough, Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { redactSecrets } from "@cbm/shared";
import { randomBytes } from "node:crypto";
import { docker, helperImage, spawnDocker } from "./docker.js";
import { HashCounter, encryptStream } from "./crypto.js";
import { tarExcludes } from "./excludes.js";

export interface CaptureResult {
  /** sha256 of the plaintext tar (what the manifest records, as before). */
  sha256: string;
  /** Bytes as stored (encrypted size when encrypted). */
  storedBytes: number;
}

/**
 * Archive `source` (a volume name or an absolute host folder) as a tar and hand
 * the bytes to `sink`, encrypted on the way when `encryptKey` is set, while a
 * second network-less container reads the same plaintext back with `tar -t`:
 * an archive that doesn't read back fails here, as the old check-after-copy
 * did. Nothing touches the local disk unless `sink` writes there, so a volume
 * can go straight to the destination, and an encrypted copy no longer needs
 * room for both the plaintext and the ciphertext.
 */
export async function captureTar(
  source: string,
  sink: (body: Readable) => Promise<void>,
  encryptKey?: string,
  /** Paths left out (see excludes.ts). */
  excludes: string[] = [],
  /** `source` is a single host file (a bind mount of a file): the archive
   * holds it alone, as `data`. */
  file = false,
): Promise<CaptureResult> {
  // Named, so a failed copy can remove them: stopping `docker run` alone leaves
  // the container running (tar as PID 1 ignores SIGTERM, hence --init too).
  const id = randomBytes(6).toString("hex");
  const tarName = `cbm-capture-${id}`;
  const checkName = `cbm-capture-check-${id}`;
  const tar = spawnDocker(
    file
      ? ["run", "--rm", "--init", "--name", tarName, "-v", `${source}:/c/data:ro`, helperImage(), "tar", "-cf", "-", "-C", "/c", "data"]
      : ["run", "--rm", "--init", "--name", tarName, "-v", `${source}:/data:ro`, helperImage(), "tar", "-cf", "-", "-C", "/data", ...tarExcludes(excludes), "."],
    ["ignore", "pipe", "pipe"],
  );
  const check = spawnDocker(
    ["run", "--rm", "--init", "-i", "--name", checkName, "--network", "none", helperImage(), "tar", "-tf", "-"],
    ["pipe", "ignore", "pipe"],
  );
  let tarErr = "";
  let checkErr = "";
  tar.stderr?.on("data", (d) => (tarErr += String(d)));
  check.stderr?.on("data", (d) => (checkErr += String(d)));
  const tarExit = once(tar, "close") as Promise<[number | null]>;
  const checkExit = once(check, "close") as Promise<[number | null]>;
  const checkIn = check.stdin!;
  checkIn.on("error", () => undefined); // EPIPE when the checker stops early: its exit code says why

  // Feed the checker alongside the main stream, honouring its backpressure.
  const tee = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      if (checkIn.write(chunk)) return cb(null, chunk);
      const done = (err?: Error) => {
        checkIn.off("drain", onDrain);
        checkIn.off("close", onClose);
        cb(err ?? null, chunk);
      };
      const onDrain = () => done();
      const onClose = () => done(new Error(`the archive check of ${source} stopped early`));
      checkIn.once("drain", onDrain);
      checkIn.once("close", onClose);
    },
    flush(cb) {
      checkIn.end();
      cb();
    },
  });
  const plain = new HashCounter();
  const stored = new HashCounter();
  const out = new PassThrough();
  try {
    await Promise.all([
      pipeline([tar.stdout!, tee, plain, ...(encryptKey ? [encryptStream(encryptKey)] : []), stored, out]),
      sink(out),
    ]);
  } catch (e) {
    tar.stdout?.destroy();
    checkIn.destroy();
    await docker(["rm", "-f", tarName, checkName]).catch(() => undefined);
    tar.kill();
    check.kill();
    throw e;
  }
  const [tarCode] = await tarExit;
  const [checkCode] = await checkExit;
  if (tarCode !== 0) throw new Error(`Archiving ${source} failed (tar exited ${tarCode}): ${redactSecrets(tarErr.slice(0, 1000))}`);
  if (checkCode !== 0) {
    throw new Error(`The archive of ${source} doesn't read back (tar -t exited ${checkCode}): ${redactSecrets(checkErr.slice(0, 1000))}`);
  }
  return { sha256: plain.digest(), storedBytes: stored.bytes };
}
