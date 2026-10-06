// Schedule summaries (lib/schedule.ts): frequency presets, backup modes and the
// capture mode of a snapshot. `{zone}` is " <timezone>" or empty.
export const en = {
  cron: {
    hourly: "hourly",
    daily: "daily at 02:00{zone}",
    weekly: "weekly (Mon 02:00{zone})",
    monthly: "monthly (1st, 02:00{zone})",
  },
  mode: { backup: "backup", sync: "sync" },
  capture: { dump: "dump", frozen: "frozen", live: "live", none: "none", config: "configuration only" },
};

export const fr: typeof en = {
  cron: {
    hourly: "toutes les heures",
    daily: "tous les jours à 02:00{zone}",
    weekly: "chaque semaine (lun. 02:00{zone})",
    monthly: "chaque mois (le 1er, 02:00{zone})",
  },
  mode: { backup: "sauvegarde", sync: "synchro" },
  capture: { dump: "dump", frozen: "gelée", live: "à chaud", none: "aucune", config: "configuration seule" },
};
