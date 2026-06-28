import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, Input, Label } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { requireUser } from "@/lib/session";
import { changeEmail, changePassword } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser();

  return (
    <>
      <PageHeader title="Profile" description="Manage your sign-in credentials" />
      <div className="flex max-w-xl flex-col gap-6">
        <Card id="email" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>Email</CardTitle>
            <p className="text-sm text-muted-foreground">
              The address you sign in with. Changing it takes effect immediately.
            </p>
          </CardHeader>
          <CardContent>
            <ActionForm action={changeEmail} submitLabel="Update email" resetOnSuccess={false}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="newEmail">Email address</Label>
                <Input id="newEmail" name="newEmail" type="email" defaultValue={user.email} required />
              </div>
            </ActionForm>
          </CardContent>
        </Card>

        <Card id="password" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <p className="text-sm text-muted-foreground">
              Use at least 8 characters. Changing your password signs out your other sessions.
            </p>
          </CardHeader>
          <CardContent>
            <ActionForm action={changePassword} submitLabel="Change password">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="currentPassword">Current password</Label>
                <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="newPassword">New password</Label>
                <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
