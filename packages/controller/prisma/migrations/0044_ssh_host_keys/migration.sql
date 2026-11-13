-- SSH host keys of a destination (target and jump host), learned on first use.
ALTER TABLE "Destination" ADD COLUMN "sshHostKeys" JSONB;
