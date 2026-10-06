import { PageHeader } from "@/components/page-header";
import { Badge, List, ListItem, Section } from "@/components/ui";
import { ActionButton } from "@/components/action-button";
import { revokeInvitation } from "@/app/actions";
import { getT } from "@/lib/i18n";
import { Mail, ShieldCheck, X } from "lucide-react";
import { InviteButton, type PendingInvite } from "./invite-panel";
import { UserRowActions } from "./user-row-actions";

export type UserRow = { id: string; name: string; email: string; role: string; twoFactorEnabled: boolean };

function initials(u: UserRow) {
  const src = (u.name || u.email).trim();
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** Presentation only: the Users admin page. Data is fetched in ./page.tsx. */
export async function UsersView({
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
  const t = await getT();
  const lastAdmin = (u: UserRow) => u.role === "admin" && adminCount <= 1;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("users.title")} description={t("users.description")} action={<InviteButton canEmail={canEmail} />} />

      <Section title={t("users.members")}>
        <List>
          {users.map((u) => (
            <ListItem key={u.id} className="flex-wrap gap-y-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
                {initials(u)}
              </span>
              <div className="min-w-0 flex-1 basis-40">
                <p className="flex items-center gap-2 truncate text-sm font-medium">
                  {u.name || u.email}
                  {u.id === meId && <Badge>{t("users.you")}</Badge>}
                  {u.twoFactorEnabled && (
                    <Badge tone="success">
                      <ShieldCheck /> {t("twofactor.badge")}
                    </Badge>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">{u.email}</p>
              </div>
              <UserRowActions
                userId={u.id}
                email={u.email}
                role={u.role}
                isSelf={u.id === meId}
                isLastAdmin={lastAdmin(u)}
                twoFactorEnabled={u.twoFactorEnabled}
              />
            </ListItem>
          ))}
        </List>
      </Section>

      {invites.length > 0 && (
        <Section title={t("users.invite.pending")}>
          <List>
            {invites.map((i) => (
              <ListItem key={i.id}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed text-muted-foreground">
                  <Mail className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{i.email}</p>
                  <p className="text-xs text-muted-foreground">{t("users.invite.expires", { date: i.expires })}</p>
                </div>
                <Badge tone={i.role === "admin" ? "accent" : "neutral"}>{t(`users.roles.${i.role}`)}</Badge>
                <ActionButton
                  action={revokeInvitation.bind(null, i.id)}
                  variant="ghost"
                  size="icon-sm"
                  title={t("users.invite.revokeAria")}
                  successMsg={t("users.invite.revoked")}
                >
                  <X />
                  <span className="sr-only">{t("users.invite.revokeAria")}</span>
                </ActionButton>
              </ListItem>
            ))}
          </List>
        </Section>
      )}
    </div>
  );
}
