"use client";

import { useState, useTransition } from "react";
import { createDestination } from "@/app/actions";
import { DestinationFormView } from "./view";

export function DestinationForm() {
  const [type, setType] = useState("local");
  const [engine, setEngine] = useState("tar");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const formEl = e.currentTarget;
    setError(null);
    start(async () => {
      const r = await createDestination(fd);
      if (r?.error) setError(r.error);
      else formEl.reset();
    });
  };

  return (
    <DestinationFormView
      type={type}
      onTypeChange={setType}
      engine={engine}
      onEngineChange={setEngine}
      pending={pending}
      error={error}
      onSubmit={onSubmit}
    />
  );
}
