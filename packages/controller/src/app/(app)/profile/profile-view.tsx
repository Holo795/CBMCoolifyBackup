import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, Input, Label } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { changeEmail, changePassword, updateProfileName } from "@/app/actions";
import { getT } from "@/lib/i18n";

/** Presentation only: the Profile page markup. Data is fetched in ./page.tsx. */
export async function ProfileView({
  email,
  firstName,
  lastName,
}: {
  email: string;
  firstName: string;
  lastName: string;
}) {
  const t = await getT();
  return (
    <>
      <PageHeader title={t("profile.title")} description={t("profile.description")} />
      <div className="flex max-w-xl flex-col gap-6">
        <Card id="name" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>{t("profile.nameCard")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("profile.nameHint")}</p>
          </CardHeader>
          <CardContent>
            <ActionForm action={updateProfileName} submitLabel={t("profile.saveName")} resetOnSuccess={false}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="firstName">{t("profile.firstName")}</Label>
                  <Input id="firstName" name="firstName" defaultValue={firstName} autoComplete="given-name" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="lastName">{t("profile.lastName")}</Label>
                  <Input id="lastName" name="lastName" defaultValue={lastName} autoComplete="family-name" />
                </div>
              </div>
            </ActionForm>
          </CardContent>
        </Card>

        <Card id="email" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>{t("profile.emailCard")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("profile.emailHint")}</p>
          </CardHeader>
          <CardContent>
            <ActionForm action={changeEmail} submitLabel={t("profile.updateEmail")} resetOnSuccess={false}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="newEmail">{t("profile.emailAddress")}</Label>
                <Input id="newEmail" name="newEmail" type="email" defaultValue={email} required />
              </div>
            </ActionForm>
          </CardContent>
        </Card>

        <Card id="password" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>{t("profile.passwordCard")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("profile.passwordHint")}</p>
          </CardHeader>
          <CardContent>
            <ActionForm action={changePassword} submitLabel={t("profile.changePassword")}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="currentPassword">{t("profile.currentPassword")}</Label>
                <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="newPassword">{t("profile.newPassword")}</Label>
                <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirmPassword">{t("profile.confirmPassword")}</Label>
                <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
