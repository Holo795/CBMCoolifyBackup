# Restoring without CBM

CBM restores for you: in place, as a clone, onto another Coolify (see [Restore](restore.md)).
This page is for the day CBM itself can't: no controller, no recovery file, or you simply want to
know that your backups don't depend on it. Everything CBM stores is in open formats - restic
repositories, tar archives, SQL dumps - and two keys are enough to read them.

## 1. Keep the keys somewhere else

Each destination has the key that opens what is stored there:

| Engine | Key | Without it |
| --- | --- | --- |
| **restic** | the repository password | the repository can't be opened |
| **tar** with encryption | a 32-byte AES-256-GCM key (base64) | the `.enc` files can't be decrypted |
| **tar** without encryption | none | anyone with access to the files can read them |

An admin shows them from the destination card's **…** menu → **Recovery keys** (password, and the
two-factor code when 2FA is on; each reveal is logged). Copy them into your password manager or
your printed recovery sheet - **not** on the same storage as the backups. The recovery file (see
[Disaster recovery](disaster-recovery.md#2-recovery-file-the-bootstrap-key)) also carries them,
but only for whoever has its passphrase and a CBM to import it into.

## 2. Where the backups are

Every backup of a resource is identified by the resource's Coolify UUID (shown on its page in
CBM and in Coolify's URLs).

### restic engine

The repository is a folder named `restic-repo` under the destination's base path:

| Destination | `RESTIC_REPOSITORY` |
| --- | --- |
| Local | `<base path>/restic-repo` (on the agent's host) |
| SSH / SFTP | `sftp:<user>@<host>:<base path>/restic-repo` |
| S3 | `s3:<endpoint>/<bucket>/<prefix>restic-repo` |

Every snapshot is written with the host `cbm` and tagged:

- `res:<resource UUID>` - the resource;
- `snap:<backup id>` - one backup (its id in CBM);
- `part:volume` - on the snapshot that holds the volumes and host folders. The other snapshot of
  the same backup holds the dumps, `config.json` and `manifest.json`.

```bash
export RESTIC_REPOSITORY='sftp:backup@storage.example.com:/srv/cbm/restic-repo'
export RESTIC_PASSWORD_FILE=~/restic-password   # the destination's repository password
# S3: also AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
restic snapshots --host cbm --tag res:<resource UUID>
```

Pick the two snapshots with the same `snap:` tag (the newest pair is the newest backup) and
restore them:

```bash
restic restore <id of the part:volume snapshot> --target ./restore/volumes
restic restore <id of the other snapshot> --target ./restore/files
```

In the volume snapshot, each Docker volume is under `/volume/<volume name>` and each host folder
or file under `/bind/<name>`. In the other one, the files sit in a folder named after the backup
id (the agent's work folder at the time): `restic ls <id>` shows the full path.

### tar engine

One folder per backup:

```
<base path>/<instance id>/<resource UUID>/backups/<date and time>/
  manifest.json                      what the backup holds (never encrypted)
  config.json[.enc]                  the resource's definition when it was backed up
  dump-<engine>-<container>.sql[.enc]  database dump (MongoDB: a mongodump archive)
  dump-<engine>-<container>.rdb[.enc]  Redis / KeyDB / Dragonfly snapshot
  volume-<volume name>.tar[.enc]     one archive per Docker volume
  volume-bind-<name>.tar[.enc]       one archive per host folder or file
```

A resource in `sync` mode uses `sync-copies/` instead of `backups/`. `manifest.json` lists every
file with its size and, for the tar engine, its sha256 (of the content before encryption).

Environment variables of applications and services are in `manifest.json` (`envEnc`), encrypted
with the controller's master key: without CBM, take them from your own records or from Coolify.
Database passwords are never stored in a backup.

## 3. Decrypting `.enc` files

An `.enc` file is `[IV, 12 bytes][ciphertext][GCM tag, 16 bytes]`, AES-256-GCM, with the
destination's key (base64, 32 bytes). This script decrypts one file in a stream (any size) and
refuses a damaged or tampered file; it needs Python 3 and `pip install cryptography`:

```python
# decrypt.py - usage: CBM_KEY='<base64 key>' python3 decrypt.py volume-data.tar.enc volume-data.tar
import base64, os, sys
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

key = base64.b64decode(os.environ["CBM_KEY"])
assert len(key) == 32, "the key must decode to 32 bytes"
src, dst = sys.argv[1], sys.argv[2]
size = os.path.getsize(src)
with open(src, "rb") as f, open(dst + ".part", "wb") as out:
    iv = f.read(12)
    f.seek(size - 16)
    tag = f.read(16)
    f.seek(12)
    dec = Cipher(algorithms.AES(key), modes.GCM(iv, tag)).decryptor()
    left = size - 12 - 16
    while left > 0:
        chunk = f.read(min(left, 1 << 20))
        left -= len(chunk)
        out.write(dec.update(chunk))
    dec.finalize()  # raises InvalidTag if the file was damaged or the key is wrong
os.replace(dst + ".part", dst)
```

The output is only renamed once the tag has been checked: never use a `.part` file.

## 4. Putting the data back

Stop the application that uses the data first, and keep a copy of what you overwrite.

**Volumes and host folders.** A `.tar` is the content of the volume or folder, paths relative to
its root (a single host file is archived as one entry named `data`):

```bash
docker run --rm -v <volume>:/v -v "$PWD":/b alpine sh -c 'cd /v && tar -xpf /b/volume-<volume>.tar'
```

From restic, copy the restored `volume/<volume name>/` folder into the volume the same way
(`cp -a`), or use `restic restore --include /volume/<volume name>` straight into a mounted path.

**PostgreSQL.** The dump is a plain SQL script for `psql`: the configured database first, then each
other database behind a header that creates it if needed and connects to it. Objects are dropped
and recreated (`--clean --if-exists`), with no owner:

```bash
docker exec -i <postgres container> psql -U <user> -d <database> -v ON_ERROR_STOP=1 < dump-postgresql-<container>.sql
```

**MySQL / MariaDB.** Every database except the system ones, with their `CREATE DATABASE`:

```bash
docker exec -i -e MYSQL_PWD='<root password>' <container> mysql -uroot < dump-mysql-<container>.sql
```

(`mariadb` in place of `mysql` on recent MariaDB images.)

**MongoDB.** The file is a `mongodump --archive` (whatever its extension):

```bash
docker exec -i <container> mongorestore --archive --drop -u <user> -p '<password>' --authenticationDatabase admin < dump-mongodb-<container>.sql
```

**Redis / KeyDB / Dragonfly.** Stop the container, copy the `.rdb` into its data volume as the file
it loads at start (`dump.rdb` by default), and start it again. With AOF on (`appendonly yes`), the
server loads the AOF instead: move the AOF folder aside before starting, or the `.rdb` is ignored.

**Configuration.** `config.json` holds the resource's definition when it was backed up (image or
git commit, build pack, compose file, domains): use it to recreate the resource in Coolify by hand
before putting its data back.

## 5. Try it once

Restore one backup by hand, on a spare machine, before you need it: it proves the keys you kept
are the right ones and that you know where everything is. CBM's own [test restores](restore.md)
check the backups; this checks you.
