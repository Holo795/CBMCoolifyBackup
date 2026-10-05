import type { ResolvedDestination } from "@cbm/shared";
import type { MsgVars } from "./user-error";

/** A result message as a dictionary key + vars; the action translates it. */
export type TestMsg = { key: string; vars?: MsgVars };

/** Verify a destination is reachable and writable/listable. Runs in the controller.
 * `error` is the raw (untranslatable) failure from the client libraries. */
export async function testDestination(
  dest: ResolvedDestination,
): Promise<{ ok: boolean; detail?: TestMsg; error?: string | TestMsg }> {
  try {
    if (dest.type === "local") {
      // The folder lives on each agent's host, not here: probing the
      // controller's own filesystem proved nothing (and fails as non-root).
      return { ok: true, detail: { key: "messages.localTestInfo", vars: { path: dest.basePath } } };
    }

    if (dest.type === "ssh") {
      const mod = await import("ssh2-sftp-client");
      const client = new mod.default();
      const auth = { username: dest.username, password: dest.password, privateKey: dest.privateKey };
      let jump: import("ssh2").Client | null = null;
      if (dest.jumpHost) {
        const { Client } = await import("ssh2");
        jump = new Client();
        const j = jump;
        await new Promise<void>((resolve, reject) => {
          j.on("ready", () => resolve())
            .on("error", reject)
            .connect({
              host: dest.jumpHost,
              port: dest.jumpPort,
              username: dest.jumpUsername || dest.username,
              password: dest.jumpPassword || dest.password,
              privateKey: dest.jumpPrivateKey || dest.privateKey,
            });
        });
        const sock = await new Promise<import("stream").Duplex>((resolve, reject) => {
          j.forwardOut("127.0.0.1", 0, dest.host, dest.port, (err, stream) => (err ? reject(err) : resolve(stream)));
        });
        await client.connect({ sock, ...auth });
      } else {
        await client.connect({ host: dest.host, port: dest.port, ...auth });
      }
      try {
        const list = await client.list(dest.basePath).catch(() => []);
        const vars = { host: dest.host, port: dest.port, count: list.length, path: dest.basePath };
        return dest.jumpHost
          ? { ok: true, detail: { key: "messages.sshTestOkVia", vars: { ...vars, jump: dest.jumpHost } } }
          : { ok: true, detail: { key: "messages.sshTestOk", vars } };
      } finally {
        await client.end().catch(() => undefined);
        jump?.end();
      }
    }

    if (dest.type === "s3") {
      const { S3Client, ListObjectsV2Command } = await import("@aws-sdk/client-s3");
      const client = new S3Client({
        region: dest.region,
        endpoint: dest.endpoint || undefined,
        forcePathStyle: dest.forcePathStyle,
        credentials: { accessKeyId: dest.accessKeyId, secretAccessKey: dest.secretAccessKey },
      });
      const res = await client.send(new ListObjectsV2Command({ Bucket: dest.bucket, MaxKeys: 1 }));
      client.destroy();
      return { ok: true, detail: { key: "messages.s3TestOk", vars: { bucket: dest.bucket, count: res.KeyCount ?? 0 } } };
    }

    return { ok: false, error: { key: "messages.unknownDestinationType" } };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
