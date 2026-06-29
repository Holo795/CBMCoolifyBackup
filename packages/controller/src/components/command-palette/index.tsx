"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HardDrive, Server, Cpu, Clock, Bell, User, Mail } from "lucide-react";
import { navFor } from "@/components/nav";
import { CommandPaletteView, type Entry } from "./view";

type Index = {
  resources: { id: string; name: string; type: string }[];
  destinations: { id: string; name: string; type: string }[];
  instances: { id: string; name: string }[];
  agents: { id: string; hostname: string }[];
};

// Extra search synonyms so "tz", "webhook", "mailer" also match a page.
const NAV_KEYWORDS: Record<string, string[]> = {
  "/": ["overview", "dashboard", "home"],
  "/instances": ["instance", "coolify", "panel", "server"],
  "/resources": ["resource", "app", "application", "database", "service"],
  "/destinations": ["destination", "storage", "s3", "ssh", "local", "restic", "backup target"],
  "/snapshots": ["snapshot", "backup", "restore"],
  "/agents": ["agent", "host"],
  "/users": ["users", "members", "team", "roles", "invite", "invitation"],
  "/settings": ["settings", "config", "configuration"],
};

// Group order in the results.
const GROUP_ORDER = ["Pages", "Settings", "Resources", "Destinations", "Instances", "Agents"];

// Non-nav static entries (page links that aren't in the sidebar NAV).
const EXTRA_STATIC: Entry[] = [
  {
    id: "nav:/profile",
    label: "Profile",
    href: "/profile",
    group: "Pages",
    keywords: ["profile", "account", "name", "password", "email", "credentials"],
    icon: User,
  },
  {
    id: "settings:timezone",
    label: "Timezone",
    sub: "Settings",
    href: "/settings#timezone",
    group: "Settings",
    keywords: ["timezone", "time", "tz", "clock"],
    icon: Clock,
  },
  {
    id: "settings:alerts",
    label: "Failure alerts (webhook)",
    sub: "Settings",
    href: "/settings#alerts",
    group: "Settings",
    keywords: ["alert", "webhook", "discord", "slack", "notification"],
    icon: Bell,
  },
  {
    id: "settings:email",
    label: "Email (SMTP)",
    sub: "Settings",
    href: "/settings#email",
    group: "Settings",
    keywords: ["smtp", "email", "mail", "mailer", "password reset", "verification", "reset"],
    icon: Mail,
  },
];

export function CommandPalette({ role }: { role: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [index, setIndex] = useState<Index | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Load the searchable entities once each time the palette opens.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setActive(0);
      return;
    }
    if (index) return;
    fetch("/api/search-index")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setIndex(d))
      .catch(() => undefined);
  }, [open, index]);

  // All entries (static + dynamic from the loaded index).
  const entries = useMemo<Entry[]>(() => {
    const navEntries: Entry[] = navFor(role).map((n) => ({
      id: `nav:${n.href}`,
      label: n.label,
      href: n.href,
      group: "Pages",
      keywords: NAV_KEYWORDS[n.href],
      icon: n.icon,
    }));
    const dyn: Entry[] = [];
    if (index) {
      for (const r of index.resources)
        dyn.push({ id: `r:${r.id}`, label: r.name, sub: r.type, href: `/resources/${r.id}`, group: "Resources" });
      for (const d of index.destinations)
        dyn.push({ id: `d:${d.id}`, label: d.name, sub: d.type, href: `/destinations/${d.id}`, group: "Destinations", icon: HardDrive });
      for (const i of index.instances)
        dyn.push({ id: `i:${i.id}`, label: i.name, href: `/instances`, group: "Instances", icon: Server });
      for (const a of index.agents) dyn.push({ id: `a:${a.id}`, label: a.hostname, href: `/agents`, group: "Agents", icon: Cpu });
    }
    return [...navEntries, ...EXTRA_STATIC, ...dyn];
  }, [index, role]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = q
      ? entries.filter((e) => [e.label, e.sub ?? "", e.group, ...(e.keywords ?? [])].join(" ").toLowerCase().includes(q))
      : entries.filter((e) => e.group === "Pages" || e.group === "Settings");
    return match.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group)).slice(0, 50);
  }, [entries, query]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const go = (e: Entry) => {
    setOpen(false);
    router.push(e.href);
    const hash = e.href.split("#")[1];
    if (hash) setTimeout(() => document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
  };

  const onKeyNav = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[active]) go(filtered[active]);
    }
  };

  return (
    <CommandPaletteView
      query={query}
      onQueryChange={setQuery}
      filtered={filtered}
      active={active}
      onActiveChange={setActive}
      onSelect={go}
      onClose={() => setOpen(false)}
      onKeyNav={onKeyNav}
      listRef={listRef}
    />
  );
}
