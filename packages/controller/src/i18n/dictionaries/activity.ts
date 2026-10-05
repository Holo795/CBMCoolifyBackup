// Bottom activity bar (agent job queue).
export const en = {
  title: "Activity",
  running: "{count} running",
  idle: "No active jobs",
  recent: "Recent activity",
  empty: "Nothing yet",
  show: "Show activity",
  hide: "Hide",
  type: {
    backup: "Backup",
    restore: "Restore",
    mirror: "Mirror",
    "verify-destination": "Check",
    prune: "Prune",
  },
  status: {
    queued: "queued",
    running: "running",
    succeeded: "done",
    failed: "failed",
    skipped: "skipped",
    cancelled: "cancelled",
  },
};

export const fr: typeof en = {
  title: "Activité",
  running: "{count} en cours",
  idle: "Aucune tâche active",
  recent: "Activité récente",
  empty: "Rien pour l'instant",
  show: "Afficher l'activité",
  hide: "Masquer",
  type: {
    backup: "Sauvegarde",
    restore: "Restauration",
    mirror: "Miroir",
    "verify-destination": "Vérification",
    prune: "Purge",
  },
  status: {
    queued: "en file",
    running: "en cours",
    succeeded: "terminé",
    failed: "échoué",
    skipped: "ignoré",
    cancelled: "annulé",
  },
};
