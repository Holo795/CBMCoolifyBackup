// snapshots — translations.
export const en = {
  title: "Snapshots",
  description: "Backup runs and one-click restores",

  emptyTitle: "No snapshots yet",
  emptyHint: "Run a backup from the Resources page.",

  // List table columns.
  colResource: "Resource",
  colMode: "Mode",
  colStatus: "Status",
  colArtifacts: "Artifacts",
  colSize: "Size",
  colWhen: "When",

  artifactsCount: "{count} artifacts",

  // Row actions.
  retry: "Retry",
  retried: "Retried",
  cancelled: "Cancelled",
  noLiveAgent: "No live agent",

  // Delete confirmation.
  deleteTitle: "Delete this snapshot?",
  deleteBodyBefore: "Permanently removes this",
  deleteBodyAfterName: "snapshot ({size}), including",
  deleteBodyPlain: "Permanently removes this snapshot ({size}), including",
  deleteBodyFiles: "its files on the destination",
  deleteBodyEnd: "(deleted by the agent).",

  // Status labels.
  status: {
    queued: "queued",
    pending: "pending",
    running: "running",
    succeeded: "succeeded",
    failed: "failed",
    missing: "missing",
    corrupt: "corrupt",
    skipped: "skipped",
    cancelled: "cancelled",
  },

  // Detail page.
  repin: "Re-pin code",
  repinConfirm: "Re-pin the deployment to this snapshot's commit and redeploy?",
  detailsTitle: "Details",
  artifactsTitle: "Artifacts",
  backupLogTitle: "Backup log",
  restoresTitle: "Restores",
  noArtifacts: "No artifacts.",
  rowStatus: "Status",
  rowDirectory: "Directory",
  rowSize: "Size",
  rowCommit: "Commit",
  rowImage: "Image",
  rowError: "Error",
  enc: "enc",
  restoreTargetNew: "→ new resource",
  restoreTargetInPlace: "in place",

  // Restore actions.
  restore: "Restore",
  restoring: "Restoring…",
  cloning: "Cloning…",
  toNew: "→ new",
  restoreToNew: "Restore → new",
  restoreOnto: "Restore onto",
  targetInstanceAria: "Target instance",
  migrationHint: "Missing projects and environments are created on the target; a single-server target hosts everything.",
  cloneTitle: "Clone to a new Coolify resource and restore into it",
  noAgentTitle: "No live agent for this instance - restore needs one",
  restoreInPlaceConfirm: "Restore this snapshot in place? This overwrites current data.",
};

export const fr: typeof en = {
  title: "Snapshots",
  description: "Sauvegardes et restaurations en un clic",

  emptyTitle: "Aucun snapshot pour le moment",
  emptyHint: "Lancez une sauvegarde depuis la page Ressources.",

  colResource: "Ressource",
  colMode: "Mode",
  colStatus: "Statut",
  colArtifacts: "Artefacts",
  colSize: "Taille",
  colWhen: "Quand",

  artifactsCount: "{count} artefacts",

  retry: "Relancer",
  retried: "Relancé",
  cancelled: "Annulé",
  noLiveAgent: "Aucun agent actif",

  deleteTitle: "Supprimer ce snapshot ?",
  deleteBodyBefore: "Supprime définitivement ce",
  deleteBodyAfterName: "snapshot ({size}), y compris",
  deleteBodyPlain: "Supprime définitivement ce snapshot ({size}), y compris",
  deleteBodyFiles: "ses fichiers sur la destination",
  deleteBodyEnd: "(supprimés par l'agent).",

  status: {
    queued: "en file",
    pending: "en attente",
    running: "en cours",
    succeeded: "réussi",
    failed: "échoué",
    missing: "manquant",
    corrupt: "corrompu",
    skipped: "ignoré",
    cancelled: "annulé",
  },

  repin: "Réépingler le code",
  repinConfirm: "Réépingler le déploiement sur le commit de ce snapshot et redéployer ?",
  detailsTitle: "Détails",
  artifactsTitle: "Artefacts",
  backupLogTitle: "Journal de sauvegarde",
  restoresTitle: "Restaurations",
  noArtifacts: "Aucun artefact.",
  rowStatus: "Statut",
  rowDirectory: "Répertoire",
  rowSize: "Taille",
  rowCommit: "Commit",
  rowImage: "Image",
  rowError: "Erreur",
  enc: "chiffré",
  restoreTargetNew: "→ nouvelle ressource",
  restoreTargetInPlace: "sur place",

  restore: "Restaurer",
  restoring: "Restauration…",
  cloning: "Clonage…",
  toNew: "→ new",
  restoreToNew: "Restaurer → new",
  restoreOnto: "Restaurer vers",
  targetInstanceAria: "Instance cible",
  migrationHint: "Les projets et environnements manquants sont créés sur la cible ; une cible mono-serveur héberge tout.",
  cloneTitle: "Cloner vers une nouvelle ressource Coolify et y restaurer",
  noAgentTitle: "Aucun agent actif pour cette instance - la restauration en nécessite un",
  restoreInPlaceConfirm: "Restaurer ce snapshot sur place ? Cela écrase les données actuelles.",
};
