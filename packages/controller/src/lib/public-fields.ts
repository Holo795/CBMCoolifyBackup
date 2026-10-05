import type { Agent, CoolifyInstance, Destination } from "@/generated/prisma/client";

// Columns that never leave the server: encrypted credentials and token hashes.
// Pass them to Prisma's `omit` for any row a page hands to its view, so they
// can't end up serialized into a client component's props.
export const DESTINATION_SECRETS = { configEnc: true, encryptionKeyEnc: true, resticPasswordEnc: true } as const;
export const INSTANCE_SECRETS = { apiTokenEnc: true, enrollTokenHash: true } as const;
export const AGENT_SECRETS = { tokenHash: true } as const;

export type PublicDestination = Omit<Destination, keyof typeof DESTINATION_SECRETS>;
export type PublicInstance = Omit<CoolifyInstance, keyof typeof INSTANCE_SECRETS>;
export type PublicAgent = Omit<Agent, keyof typeof AGENT_SECRETS>;
