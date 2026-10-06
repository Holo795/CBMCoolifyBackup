// The admin's two-factor requirement (Settings). Pure, so it is unit-tested
// and usable anywhere; lib/two-factor.ts reads the stored value.

export const TWO_FACTOR_POLICIES = ["optional", "admins", "everyone"] as const;
export type TwoFactorPolicy = (typeof TWO_FACTOR_POLICIES)[number];

export function isTwoFactorPolicy(v: string): v is TwoFactorPolicy {
  return (TWO_FACTOR_POLICIES as readonly string[]).includes(v);
}

/** Does `policy` require a second factor from an account with `role`? */
export function twoFactorRequired(policy: string, role: string | null | undefined): boolean {
  if (policy === "everyone") return true;
  if (policy === "admins") return role === "admin";
  return false;
}
