// agents — translations.
export const en = {
  title: "Agents",
  description: "One per Docker host. Agents auto-enroll and self-link when you connect a Coolify instance.",
  host: "Host",
  status: "Status",
  instance: "Instance",
  server: "Server",
  docker: "Docker",
  containers: "Containers",
  lastSeen: "Last seen",
  unlinked: "unlinked",
  statuses: {
    pending: "pending",
    online: "online",
    offline: "offline",
  },
  containersCount: "{count} containers",
  seen: "seen {time}",
  empty: {
    title: "No agents connected",
    hint: "Connect a Coolify instance, then run its one-line install command (Reveal install command) on the host - the agent enrolls and links itself.",
  },
  remove: {
    title: "Remove agent “{host}”?",
    bodyBefore: "Removes this agent from the controller. If it's still running on ",
    bodyAfter: ", it will keep failing until you reconfigure it (re-run the install command).",
    bodyAfterShort: ", it will keep failing until you reconfigure it.",
  },
  footer: {
    before: "Agents are deployed and configured from the ",
    link: "Coolify instances",
    after: " page - each instance has its own enrollment token, so agents link themselves automatically.",
  },
};

export const fr: typeof en = {
  title: "Agents",
  description: "Un par hôte Docker. Les agents s'enrôlent automatiquement et se lient d'eux-mêmes lorsque vous connectez une instance Coolify.",
  host: "Hôte",
  status: "Statut",
  instance: "Instance",
  server: "Serveur",
  docker: "Docker",
  containers: "Conteneurs",
  lastSeen: "Vu pour la dernière fois",
  unlinked: "non lié",
  statuses: {
    pending: "en attente",
    online: "en ligne",
    offline: "hors ligne",
  },
  containersCount: "{count} conteneurs",
  seen: "vu {time}",
  empty: {
    title: "Aucun agent connecté",
    hint: "Connectez une instance Coolify, puis exécutez sa commande d'installation en une ligne (Afficher la commande d'installation) sur l'hôte - l'agent s'enrôle et se lie tout seul.",
  },
  remove: {
    title: "Retirer l'agent « {host} » ?",
    bodyBefore: "Retire cet agent du contrôleur. S'il tourne toujours sur ",
    bodyAfter: ", il continuera d'échouer jusqu'à ce que vous le reconfiguriez (relancer la commande d'installation).",
    bodyAfterShort: ", il continuera d'échouer jusqu'à ce que vous le reconfiguriez.",
  },
  footer: {
    before: "Les agents sont déployés et configurés depuis la page ",
    link: "instances Coolify",
    after: " - chaque instance possède son propre jeton d'enrôlement, les agents se lient donc automatiquement.",
  },
};
