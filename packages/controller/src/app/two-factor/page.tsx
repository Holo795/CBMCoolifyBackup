import { TwoFactorVerifyForm } from "./verify-form";

export const dynamic = "force-dynamic";

/** Second step of a sign-in for an account with two-factor (password or social). */
export default function TwoFactorPage() {
  return <TwoFactorVerifyForm />;
}
