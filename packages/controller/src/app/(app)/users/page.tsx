import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, can } from "@/lib/session";
import { getTimezone } from "@/lib/settings";
import { formatDateTime } from "@/lib/cn";
import { UsersView } from "./users-view";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const me = await requireUser();
  // Non-admins shouldn't reach this page (nav hides it); redirect rather than error.
  if (!can(me, "admin")) redirect("/");

  const [users, invitesRaw, tz] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, role: true },
    }),
    prisma.invitation.findMany({ where: { acceptedAt: null }, orderBy: { createdAt: "desc" } }),
    getTimezone(),
  ]);
  const { smtpReady } = await import("@/lib/email");
  const canEmail = await smtpReady();

  const adminCount = users.filter((u) => u.role === "admin").length;
  const now = Date.now();
  const invites = invitesRaw
    .filter((i) => i.expiresAt.getTime() > now)
    .map((i) => ({ id: i.id, email: i.email, role: i.role, expires: formatDateTime(i.expiresAt, tz) }));

  return <UsersView users={users} invites={invites} canEmail={canEmail} meId={me.id} adminCount={adminCount} />;
}
