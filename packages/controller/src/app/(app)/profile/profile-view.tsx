import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Input, Field } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { changeEmail, changePassword, updateProfileName } from "@/app/actions";
import { getT } from "@/lib/i18n";
import { TwoFactorCard } from "@/components/two-factor/profile-card";

/** Presentation only: the Profile page markup. Data is fetched in ./page.tsx. */
export async function ProfileView({
  email,
  firstName,
  lastName,
  twoFactor,
}: {
  email: string;
  firstName: string;
  lastName: string;
  twoFactor: { enabled: boolean; required: boolean; hasPassword: boolean };
}) {
  const t = await getT();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("profile.title")} description={t("profile.description")} />
      <div className="flex max-w-2xl flex-col gap-6">
        <Card id="name" className="scroll-mt-8">
          <CardHeader>
            <CardTitle>{t("profile.nameCard")}</CardTitle>
            <CardDescription>{t("profile.nameHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={updateProfileName} submitLabel={t("profile.saveName")} resetOnSuccess={false}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={t("profile.firstName")} htmlFor="firstName">
                  <Input id="firstName" name="firstName" defaultValue={firstName} autoComplete="given-name" />
                </Field>
                <Field label={t("profile.lastName")} htmlFor="lastName">
                  <Input id="lastName" name="lastName" defaultValue={lastName} autoComplete="family-name" />
                </Field>
              </div>
            </ActionForm>
          </CardContent>
        </Card>

        <Card id="email" className="scroll-mt-8">
          <CardHeader>
            <CardTitle>{t("profile.emailCard")}</CardTitle>
            <CardDescription>{t("profile.emailHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={changeEmail} submitLabel={t("profile.updateEmail")} resetOnSuccess={false}>
              <Field label={t("profile.emailAddress")} htmlFor="newEmail">
                <Input id="newEmail" name="newEmail" type="email" defaultValue={email} autoComplete="email" required />
              </Field>
            </ActionForm>
          </CardContent>
        </Card>

        <Card id="password" className="scroll-mt-8">
          <CardHeader>
            <CardTitle>{t("profile.passwordCard")}</CardTitle>
            <CardDescription>{t("profile.passwordHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={changePassword} submitLabel={t("profile.changePassword")}>
              {/* Lets password managers attach the new password to the right account. */}
              <input type="email" name="username" autoComplete="username" defaultValue={email} hidden readOnly />
              <Field label={t("profile.currentPassword")} htmlFor="currentPassword">
                <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={t("profile.newPassword")} htmlFor="newPassword">
                  <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required />
                </Field>
                <Field label={t("profile.confirmPassword")} htmlFor="confirmPassword">
                  <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
                </Field>
              </div>
            </ActionForm>
          </CardContent>
        </Card>

        <TwoFactorCard {...twoFactor} />
      </div>
    </div>
  );
}
