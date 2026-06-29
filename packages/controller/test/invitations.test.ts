import { test } from "node:test";
import assert from "node:assert/strict";
import { decideInviteSignup, inviteExpiry, INVITE_TTL_MS, type InviteFacts } from "../src/lib/invitations";

const NOW = new Date("2026-06-29T12:00:00Z");
const future = new Date(NOW.getTime() + 60_000);
const past = new Date(NOW.getTime() - 60_000);

/** A claimed, pending, unexpired invite for the given email. */
function claimedInvite(over: Partial<InviteFacts> = {}): InviteFacts {
  return { email: "bob@example.com", role: "operator", expiresAt: future, claimedAt: NOW, acceptedAt: null, ...over };
}

test("inviteExpiry adds 48h", () => {
  assert.equal(INVITE_TTL_MS, 48 * 60 * 60 * 1000);
  assert.equal(inviteExpiry(NOW).getTime(), NOW.getTime() + INVITE_TTL_MS);
});

test("bootstrap: first user (no users yet) is allowed as admin, ignoring invites", () => {
  assert.deepEqual(decideInviteSignup({ userCount: 0, email: "anyone@x.com", invite: null, now: NOW }), {
    allow: true,
    role: "admin",
  });
});

test("valid claimed invite allows signup with the invite's role", () => {
  assert.deepEqual(
    decideInviteSignup({ userCount: 1, email: "bob@example.com", invite: claimedInvite({ role: "viewer" }), now: NOW }),
    { allow: true, role: "viewer" },
  );
});

test("email match is case-insensitive", () => {
  const r = decideInviteSignup({ userCount: 1, email: "BOB@Example.com", invite: claimedInvite(), now: NOW });
  assert.equal(r.allow, true);
  assert.equal(r.role, "operator");
});

test("no invite → registration stays closed", () => {
  assert.deepEqual(decideInviteSignup({ userCount: 1, email: "bob@example.com", invite: null, now: NOW }), {
    allow: false,
  });
});

test("unclaimed invite is rejected (token never proven)", () => {
  const r = decideInviteSignup({ userCount: 1, email: "bob@example.com", invite: claimedInvite({ claimedAt: null }), now: NOW });
  assert.equal(r.allow, false);
});

test("expired invite is rejected", () => {
  const r = decideInviteSignup({ userCount: 1, email: "bob@example.com", invite: claimedInvite({ expiresAt: past }), now: NOW });
  assert.equal(r.allow, false);
});

test("already-accepted invite is rejected (single use)", () => {
  const r = decideInviteSignup({ userCount: 1, email: "bob@example.com", invite: claimedInvite({ acceptedAt: NOW }), now: NOW });
  assert.equal(r.allow, false);
});

test("email mismatch is rejected", () => {
  const r = decideInviteSignup({ userCount: 1, email: "eve@example.com", invite: claimedInvite(), now: NOW });
  assert.equal(r.allow, false);
});
