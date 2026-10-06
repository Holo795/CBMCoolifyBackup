// Shared interactive components (forms, confirm dialogs).
export const en = {
  working: "Working…",
  deleting: "Deleting…",
  deleted: "Deleted",
  moreActions: "More actions",
  // "Type <word> to confirm:" - the word is styled, so the text is split.
  typeBefore: "Type",
  typeAfter: "to confirm:",
  palette: {
    placeholder: "Jump to a page, resource, destination… (try “timezone”)",
    noResults: "No results",
    alerts: "Failure alerts (webhook)",
    groups: {
      Pages: "Pages",
      Settings: "Settings",
      Resources: "Resources",
      Destinations: "Destinations",
      Instances: "Instances",
      Agents: "Agents",
    },
  },
  openMenu: "Open menu",
  closeMenu: "Close menu",
  language: "Language",
  autoDetect: "Auto-detect",
  auto: "auto",
  liveLog: {
    live: "live",
    finished: "finished - {status}",
    events: "{count} events",
    waiting: "Waiting for the agent…",
  },
};

export const fr: typeof en = {
  working: "En cours…",
  deleting: "Suppression…",
  deleted: "Supprimé",
  moreActions: "Plus d'actions",
  typeBefore: "Tapez",
  typeAfter: "pour confirmer :",
  palette: {
    placeholder: "Aller à une page, une ressource, une destination… (essayez « fuseau »)",
    noResults: "Aucun résultat",
    alerts: "Alertes d'échec (webhook)",
    groups: {
      Pages: "Pages",
      Settings: "Paramètres",
      Resources: "Ressources",
      Destinations: "Destinations",
      Instances: "Instances",
      Agents: "Agents",
    },
  },
  openMenu: "Ouvrir le menu",
  closeMenu: "Fermer le menu",
  language: "Langue",
  autoDetect: "Détection auto",
  auto: "auto",
  liveLog: {
    live: "en direct",
    finished: "terminé - {status}",
    events: "{count} événements",
    waiting: "En attente de l'agent…",
  },
};
