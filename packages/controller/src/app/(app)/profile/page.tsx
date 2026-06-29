import { requireUser } from "@/lib/session";
import { ProfileView } from "./profile-view";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = (await requireUser()) as { email: string; firstName?: string | null; lastName?: string | null };
  return <ProfileView email={user.email} firstName={user.firstName ?? ""} lastName={user.lastName ?? ""} />;
}
