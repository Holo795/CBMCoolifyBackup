"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button, Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui";
import { useT } from "@/components/i18n-provider";
import { createApiToken } from "@/app/actions";
import { ApiTokensView, ApiTokenFormView, ApiTokenRevealView, type ApiTokenRow } from "./view";

export type { ApiTokenRow };

/** The list of machine API tokens (MCP server / external AI agents). Markup in ./view.tsx. */
export function ApiTokens({ tokens }: { tokens: ApiTokenRow[] }) {
  return <ApiTokensView tokens={tokens} />;
}

/**
 * "New token" button + dialog. Create is reveal-once: the plaintext is shown
 * in the dialog and never again.
 */
export function CreateApiTokenButton() {
  const t = useT();
  const router = useRouter();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("operator");
  const [pending, start] = useTransition();
  const [revealed, setRevealed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("name", name);
      fd.set("role", role);
      const res = await createApiToken(fd);
      if (res.error || !res.token) {
        setError(res.error ?? t("apitokens.createFailed"));
        return;
      }
      setRevealed(res.token);
      toast.success(t("apitokens.created"));
      router.refresh();
    });
  };

  const onOpenChange = (v: boolean) => {
    setOpen(v);
    if (v) {
      setName("");
      setRole("operator");
      setRevealed(null);
      setError(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus /> {t("apitokens.newToken")}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={t("apitokens.newToken")}
        description={t("apitokens.newTokenDesc")}
        footer={
          revealed ? (
            <DialogClose asChild>
              <Button variant="primary">{t("apitokens.dismiss")}</Button>
            </DialogClose>
          ) : (
            <>
              <DialogClose asChild>
                <Button>{t("common.cancel")}</Button>
              </DialogClose>
              <Button type="submit" form={formId} variant="primary" loading={pending} disabled={!name.trim()}>
                {t("apitokens.create")}
              </Button>
            </>
          )
        }
      >
        {revealed ? (
          <ApiTokenRevealView token={revealed} />
        ) : (
          <ApiTokenFormView formId={formId} name={name} role={role} error={error} onNameChange={setName} onRoleChange={setRole} onSubmit={onCreate} />
        )}
      </DialogContent>
    </Dialog>
  );
}
