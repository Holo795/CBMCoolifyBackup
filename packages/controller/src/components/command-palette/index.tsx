"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  HardDrive,
  Server,
  Cpu,
  Database,
  AppWindow,
  Layers,
  Zap,
  Clock,
  Bell,
  User,
  Mail,
  LifeBuoy,
  FlaskConical,
  KeyRound,
  FileKey,
  Plus,
  UserPlus,
  Sun,
  Moon,
  Monitor,
  Languages,
  LogOut,
  BookOpen,
  Bot,
  FolderGit2,
  Bug,
  Archive,
  Users,
} from "lucide-react";
import { navFor } from "@/components/nav";
import { useT, useLocale } from "@/components/i18n-provider";
import { authClient } from "@/lib/auth-client";
import { setLocale } from "@/app/actions";
import { requestOpen } from "@/components/open-request";
import type { T } from "@/lib/i18n-shared";
import { CommandPaletteView, type Entry } from "./view";

type Index = {
  resources: { id: string; name: string; type: string }[];
  destinations: { id: string; name: string; type: string }[];
  instances: { id: string; name: string }[];
  agents: { id: string; hostname: string }[];
  snapshots?: { id: string; status: string; startedAt: string | null; resource: string }[];
  users?: { id: string; name: string; email: string }[];
  apiTokens?: { id: string; name: string; role: string }[];
};

const REPO = "https://github.com/Holo795/CBMCoolifyBackup";

// Extra search synonyms so "tz", "webhook", "mailer" also match a page. English
// and French: labels are translated, these are searched in both languages.
const NAV_KEYWORDS: Record<string, string[]> = {
  "/": ["overview", "dashboard", "home", "accueil", "tableau de bord"],
  "/instances": ["instance", "coolify", "panel", "server", "serveur"],
  "/resources": ["resource", "app", "application", "database", "service", "ressource", "base de données"],
  "/destinations": ["destination", "storage", "s3", "ssh", "sftp", "local", "restic", "backup target", "stockage"],
  "/snapshots": ["snapshot", "backup", "restore", "sauvegarde", "restauration", "clone"],
  "/agents": ["agent", "host", "hôte", "docker"],
  "/users": ["users", "members", "team", "roles", "invite", "invitation", "utilisateurs", "équipe", "rôle"],
  "/settings": ["settings", "config", "configuration", "paramètres", "réglages"],
};

// Same mapping as <ResourceIcon>, as a bare icon for the result rows.
const resourceIcon = (type: string) =>
  /redis|keydb|dragonfly/.test(type)
    ? Zap
    : /postgres|mysql|maria|mongo|clickhouse/.test(type)
      ? Database
      : type === "service"
        ? Layers
        : AppWindow;

// Each theme's own words, so "sombre" picks the dark theme first.
const THEME_WORDS = {
  light: ["light", "clair", "day", "jour"],
  dark: ["dark", "sombre", "night", "nuit"],
  system: ["system", "système", "auto", "os"],
} as const;

// Group order in the results.
const GROUP_ORDER = ["Pages", "Actions", "Settings", "Resources", "Snapshots", "Destinations", "Instances", "Agents", "Users", "Tokens", "Help"];

const settingsEntry = (t: T, id: string, label: string, keywords: string[], icon: Entry["icon"]): Entry => ({
  id: `settings:${id}`,
  label,
  sub: t("components.palette.groups.Settings"),
  href: `/settings#${id}`,
  group: "Settings",
  keywords,
  icon,
});

// Static entries beyond the sidebar pages. Admin-only ones (settings, actions
// that create things) are left out for other roles: their pages would refuse.
const staticEntries = (t: T, isAdmin: boolean): Entry[] => [
  {
    id: "nav:/profile",
    label: t("common.profile"),
    href: "/profile",
    group: "Pages",
    keywords: ["profile", "account", "name", "password", "email", "credentials", "profil", "compte", "mot de passe"],
    icon: User,
  },
  ...(isAdmin
    ? [
        {
          id: "action:connect-instance",
          label: t("components.palette.actions.connectInstance"),
          href: "/instances",
          openKey: "connect-instance",
          group: "Actions",
          keywords: ["connect", "add", "new", "coolify", "instance", "connecter", "ajouter"],
          icon: Plus,
        },
        {
          id: "action:add-destination",
          label: t("components.palette.actions.addDestination"),
          href: "/destinations",
          openKey: "add-destination",
          group: "Actions",
          keywords: ["add", "new", "destination", "s3", "ssh", "sftp", "local", "restic", "ajouter", "stockage"],
          icon: Plus,
        },
        {
          id: "action:invite-user",
          label: t("components.palette.actions.inviteUser"),
          href: "/users",
          openKey: "invite-user",
          group: "Actions",
          keywords: ["invite", "add user", "member", "team", "inviter", "utilisateur"],
          icon: UserPlus,
        },
        {
          id: "action:new-api-token",
          label: t("components.palette.actions.newApiToken"),
          href: "/settings#api-tokens",
          openKey: "new-api-token",
          group: "Actions",
          keywords: ["mcp", "api", "token", "key", "claude", "cursor", "cline", "ai", "agent", "llm", "jeton", "clé", "ia"],
          icon: KeyRound,
        },
        settingsEntry(t, "timezone", t("settings.timezoneTitle"), ["timezone", "time", "tz", "clock", "fuseau", "heure"], Clock),
        settingsEntry(t, "alerts", t("components.palette.alerts"), ["alert", "webhook", "discord", "slack", "notification", "alerte"], Bell),
        settingsEntry(
          t,
          "email",
          t("settings.emailTitle"),
          ["smtp", "email", "mail", "mailer", "password reset", "verification", "reset", "courriel", "vérification"],
          Mail,
        ),
        settingsEntry(
          t,
          "disaster-recovery",
          t("settings.drTitle"),
          ["disaster", "recovery", "dr", "self-backup", "self backup", "metadata backup", "restore cbm", "backup cbm", "sinistre", "reprise"],
          LifeBuoy,
        ),
        {
          ...settingsEntry(
            t,
            "disaster-recovery",
            t("settings.recoveryFileTitle"),
            ["recovery file", "master key", "import", "export", "fichier de récupération", "clé maîtresse"],
            FileKey,
          ),
          id: "settings:recovery-file",
        },
        settingsEntry(
          t,
          "restore-drills",
          t("settings.drillsTitle"),
          ["drill", "test restore", "verify backup", "sandbox", "test de restauration", "vérifier"],
          FlaskConical,
        ),
        settingsEntry(
          t,
          "api-tokens",
          t("settings.apiTokensTitle"),
          ["mcp", "api", "token", "claude", "cursor", "cline", "ai", "agent", "llm", "rest", "jeton", "ia"],
          KeyRound,
        ),
      ]
    : []),
  {
    id: "help:docs",
    label: t("components.palette.help.docs"),
    href: `${REPO}/tree/main/docs`,
    external: true,
    group: "Help",
    keywords: ["docs", "documentation", "help", "guide", "readme", "aide"],
    icon: BookOpen,
  },
  {
    id: "help:mcp",
    label: t("components.palette.help.mcp"),
    href: `${REPO}/blob/main/docs/mcp.md`,
    external: true,
    group: "Help",
    keywords: ["mcp", "claude", "cursor", "cline", "ai", "agent", "llm", "api", "ia"],
    icon: Bot,
  },
  {
    id: "help:source",
    label: t("components.palette.help.source"),
    href: REPO,
    external: true,
    group: "Help",
    keywords: ["github", "source", "code", "repository", "release", "version"],
    icon: FolderGit2,
  },
  {
    id: "help:issue",
    label: t("components.palette.help.issue"),
    href: `${REPO}/issues/new`,
    external: true,
    group: "Help",
    keywords: ["bug", "issue", "problem", "report", "support", "problème", "signaler"],
    icon: Bug,
  },
];

export function CommandPalette({ role }: { role: string }) {
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  const { setTheme } = useTheme();
  const [, startLocale] = useTransition();
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
    const ctrl = new AbortController();
    fetch("/api/search-index", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setIndex(d))
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [open, index]);

  // All entries (static + dynamic from the loaded index).
  const entries = useMemo<Entry[]>(() => {
    const isAdmin = role === "admin";
    const navEntries: Entry[] = navFor(role).map((n) => ({
      id: `nav:${n.href}`,
      label: t(n.labelKey),
      href: n.href,
      group: "Pages",
      keywords: NAV_KEYWORDS[n.href],
      icon: n.icon,
    }));
    // Account preferences, run in place (same as the account menu).
    const themeName = { light: t("nav.user.themeLight"), dark: t("nav.user.themeDark"), system: t("nav.user.themeSystem") };
    const prefs: Entry[] = [
      ...(["light", "dark", "system"] as const).map((th) => ({
        id: `theme:${th}`,
        label: t("components.palette.actions.theme", { name: themeName[th] }),
        run: () => setTheme(th),
        group: "Actions",
        keywords: ["theme", "thème", "mode", ...THEME_WORDS[th]],
        icon: th === "light" ? Sun : th === "dark" ? Moon : Monitor,
      })),
      ...[
        { code: "en", name: "English" },
        { code: "fr", name: "Français" },
      ]
        .filter((l) => l.code !== locale)
        .map((l) => ({
          id: `lang:${l.code}`,
          label: t("components.palette.actions.language", { name: l.name }),
          run: () =>
            startLocale(async () => {
              await setLocale(l.code);
              router.refresh();
            }),
          group: "Actions",
          keywords: ["language", "langue", "english", "français", "anglais", "french", "locale"],
          icon: Languages,
        })),
      {
        id: "action:sign-out",
        label: t("components.palette.actions.signOut"),
        run: async () => {
          await authClient.signOut();
          router.push("/login");
        },
        group: "Actions",
        keywords: ["logout", "log out", "sign out", "exit", "déconnexion", "quitter"],
        icon: LogOut,
      },
    ];
    const when = (iso: string | null) =>
      iso ? new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(iso)) : "";
    const dyn: Entry[] = [];
    if (index) {
      for (const r of index.resources)
        dyn.push({ id: `r:${r.id}`, label: r.name, sub: r.type, href: `/resources/${r.id}`, group: "Resources", icon: resourceIcon(r.type) });
      for (const s of index.snapshots ?? [])
        dyn.push({
          id: `s:${s.id}`,
          label: s.resource,
          sub: `${t(`snapshots.status.${s.status}`)} · ${when(s.startedAt)}`,
          href: `/snapshots/${s.id}`,
          group: "Snapshots",
          keywords: ["snapshot", "backup", "sauvegarde", s.status],
          icon: Archive,
        });
      for (const d of index.destinations)
        dyn.push({ id: `d:${d.id}`, label: d.name, sub: d.type, href: `/destinations/${d.id}`, group: "Destinations", icon: HardDrive });
      for (const i of index.instances)
        dyn.push({ id: `i:${i.id}`, label: i.name, href: `/instances`, group: "Instances", icon: Server });
      for (const a of index.agents) dyn.push({ id: `a:${a.id}`, label: a.hostname, href: `/agents`, group: "Agents", icon: Cpu });
      for (const u of index.users ?? [])
        dyn.push({ id: `u:${u.id}`, label: u.name || u.email, sub: u.email, href: "/users", group: "Users", icon: Users });
      for (const k of index.apiTokens ?? [])
        dyn.push({
          id: `k:${k.id}`,
          label: k.name,
          sub: t(`apitokens.role.${k.role}`),
          href: "/settings#api-tokens",
          group: "Tokens",
          keywords: ["mcp", "api", "token", "jeton"],
          icon: KeyRound,
        });
    }
    return [...navEntries, ...staticEntries(t, isAdmin), ...prefs, ...dyn];
  }, [index, role, t, locale, setTheme, router]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = q
      ? entries.filter((e) => [e.label, e.sub ?? "", e.group, ...(e.keywords ?? [])].join(" ").toLowerCase().includes(q))
      : entries.filter((e) => e.group === "Pages" || e.group === "Actions" || e.group === "Settings");
    // Group order first (the list is grouped); inside a group, entries whose
    // label contains the query come before keyword-only matches.
    const byLabel = (e: Entry) => (q && e.label.toLowerCase().includes(q) ? 0 : 1);
    return match
      .sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || byLabel(a) - byLabel(b))
      .slice(0, 50);
  }, [entries, query]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const go = (e: Entry) => {
    setOpen(false);
    if (e.run) return e.run();
    if (!e.href) return;
    if (e.external) {
      window.open(e.href, "_blank", "noopener,noreferrer");
      return;
    }
    const [path, hash] = e.href.split("#");
    if (e.openKey) {
      // A new page opens the dialog from the URL; the current one from the event.
      router.push(`${path}?open=${e.openKey}${hash ? `#${hash}` : ""}`);
      setTimeout(() => requestOpen(e.openKey!), 250);
    } else {
      router.push(e.href);
    }
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
