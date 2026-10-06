// Schedule summaries (lib/schedule.ts): frequency presets, backup modes and the
// capture mode of a snapshot. `{zone}` is " <timezone>" or empty, `{time}` is
// HH:MM, `{day}` a short weekday (from `days`, Sunday first).
export const en = {
  cron: {
    hourly: "hourly",
    hourlyAt: "hourly at :{minute}",
    daily: "daily at {time}{zone}",
    weekly: "weekly ({day} {time}{zone})",
    monthly: "monthly (day {dom}, {time}{zone})",
    days: "Sun,Mon,Tue,Wed,Thu,Fri,Sat",
  },
  mode: { backup: "backup", sync: "sync" },
  capture: { dump: "dump", frozen: "frozen", live: "live", none: "none", config: "configuration only" },
};

export const fr: typeof en = {
  cron: {
    hourly: "toutes les heures",
    hourlyAt: "toutes les heures à :{minute}",
    daily: "tous les jours à {time}{zone}",
    weekly: "chaque semaine ({day} {time}{zone})",
    monthly: "chaque mois (jour {dom}, {time}{zone})",
    days: "dim.,lun.,mar.,mer.,jeu.,ven.,sam.",
  },
  mode: { backup: "sauvegarde", sync: "synchro" },
  capture: { dump: "dump", frozen: "gelée", live: "à chaud", none: "aucune", config: "configuration seule" },
};
