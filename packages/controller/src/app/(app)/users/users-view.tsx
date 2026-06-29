import { PageHeader } from "@/components/page-header";
import { Card, CardContent, Badge } from "@/components/ui";
import { InvitePanel, type PendingInvite } from "./invite-panel";
import { UserRowActions } from "./user-row-actions";

export type UserRow = { id: string; name: string; email: string; role: string };

/** Presentation only: the Users admin page. Data is fetched in ./page.tsx. */
export function UsersView({
  users,
  invites,
  canEmail,
  meId,
  adminCount,
}: {
  users: UserRow[];
  invites: PendingInvite[];
  canEmail: boolean;
  meId: string;
  adminCount: number;
}) {
  const lastAdmin = (u: UserRow) => u.role === "admin" && adminCount <= 1;

  return (
    <>
      <PageHeader title="Users" description="Manage accounts and invite new people with a role" />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="min-w-0">
          <CardContent className="p-0">
            {/* Desktop: table. Mobile: cards (below). */}
            <table className="hidden w-full text-sm md:table">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Email</th>
                  <th className="px-4 py-2.5 font-medium">Role</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5 font-medium">
                      {u.name || "-"}
                      {u.id === meId && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={u.role === "admin" ? "accent" : "neutral"}>{u.role}</Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <UserRowActions
                        userId={u.id}
                        email={u.email}
                        role={u.role}
                        isSelf={u.id === meId}
                        isLastAdmin={lastAdmin(u)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile: one card per user. */}
            <div className="divide-y md:hidden">
              {users.map((u) => (
                <div key={u.id} className="flex flex-col gap-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="block truncate font-medium">
                        {u.name || u.email}
                        {u.id === meId && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                    </div>
                    <Badge tone={u.role === "admin" ? "accent" : "neutral"}>{u.role}</Badge>
                  </div>
                  <UserRowActions
                    userId={u.id}
                    email={u.email}
                    role={u.role}
                    isSelf={u.id === meId}
                    isLastAdmin={lastAdmin(u)}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <InvitePanel canEmail={canEmail} invites={invites} />
      </div>
    </>
  );
}
