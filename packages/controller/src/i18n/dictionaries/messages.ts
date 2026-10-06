// Server action results and errors raised by library code (UserError). The
// English text doubles as the Error message, so logs and /api/v1 stay English.
export const en = {
  noPermission: "You don't have permission to do this.",

  // Settings
  invalidTimezone: "Invalid timezone",
  webhookUrlInvalid: "Enter a valid http(s) URL, or leave blank to disable",
  webhookUrlFirst: "Enter a valid http(s) URL first",
  testNotificationSent: "Test notification sent",
  webhookRejected: "The webhook did not accept the message",

  // Profile
  passwordFieldsRequired: "Enter your current and new password",
  newPasswordTooShort: "New password must be at least 8 characters",
  newPasswordMismatch: "New password and confirmation don't match",
  changePasswordFailed: "Could not change password",
  invalidEmail: "Enter a valid email address",
  changeEmailFailed: "Could not change email",
  checkInbox: "Check your current inbox to confirm the change.",
  emailInUse: "That email address is already in use",
  nameRequired: "Enter your first and/or last name",
  updateNameFailed: "Could not update your name",

  // SMTP
  fromInvalid: "From must be a valid email address",
  smtpNotConfigured: "Set at least the SMTP host and a From address, save, then test.",
  smtpConnectFailed: "SMTP connection failed: {error}",
  smtpSendFailed: "Connected, but sending failed: {error}",
  testEmailSent: "Test email sent to {to}",
  smtpRequiredForVerification: "Configure and test SMTP first - verification needs a working mailer.",
  smtpNotWorking: "SMTP isn't working: {error}",

  // Self-backup / recovery
  pickDestinationFirst: "Pick a destination first",
  destinationNotFound: "Destination not found",
  localDiesWithMachine: "A 'local' destination dies with the machine - pick SSH or S3",
  selfBackupEnabled: "Self-backup enabled - first run within a minute",
  selfBackupDisabled: "Self-backup disabled",
  metadataBackedUp: "Metadata backed up",
  selfBackupNotConfigured: "Self-backup is not configured",
  selfBackupDestGone: "The configured self-backup destination no longer exists",
  notAPgDump: "The decrypted file is not a valid pg_dump - the backup may be corrupt",
  recoveryCheckFailed: "Recovery path check failed: {error}",
  recoveryPathWorks: "Fetched and decrypted the latest self-backup ({size} KB) - recovery path works.",
  recoveryUnauthorized: "Unauthorized",
  recoveryAdminsOnly: "Admins only",
  recoveryBadForm: "Expected multipart form data",
  recoveryWrongPassword: "Wrong password",
  recoveryTypeImport: 'Type "IMPORT" to confirm overwriting this install',
  recoveryNoFile: "No recovery file uploaded",
  recoveryNewerVersion:
    "This recovery file was exported by a NEWER CBM (migration {migration}). Update this install to at least {version}, then import again.",
  recoveryNotEmpty: "This install already has instances/destinations. Tick the override to replace everything.",
  recoveryRestoredLatest: "Restored the latest self-backup from its destination.",
  recoveryRestoredEmbedded:
    "The self-backup destination was unreachable - restored the dump embedded in the recovery file.",
  recoveryImportFailed: "Recovery import failed - check the controller logs.",
  recoveryExportFailed: "Could not generate the recovery file - check the controller logs.",

  // Instances
  allFieldsRequired: "All fields are required",
  cannotReachCoolify: "Cannot reach Coolify: {error}",
  connectedSyncFailed: "Connected, but sync failed: {error}",
  coolifyBackupQueued: "Coolify backup queued",
  baseUrlRequired: "Base URL is required",
  instanceNotFound: "Instance not found",
  cannotReachCoolifyAt: "Cannot reach Coolify at {url}: {error}",
  repointedSyncFailed: "Re-pointed, but sync failed: {error}",
  repointed: "Instance now points at {url}",

  // Agents
  agentNotFound: "Agent not found",

  // Destinations
  nameAndTypeRequired: "Name and type required",
  unknownDestinationType: "Unknown destination type",
  destinationInUse: "Still used by {count} schedule(s): {names}. Point them at another destination first.",
  localTestInfo: "Local folders live on each agent's host ({path}) - use Verify to check them from the agents.",
  sshTestOk: "Connected to {host}:{port}, {count} entries in {path}",
  sshTestOkVia: "Connected to {host}:{port} via {jump}, {count} entries in {path}",
  s3TestOk: "Bucket {bucket} reachable ({count} sample objects)",
  noAgentForCheck: "No agent online to run the check - start the agent on the host that holds these backups.",
  nothingToVerify: "Nothing to verify - this destination has no backups yet.",
  nothingToCheck: "Nothing to check - this destination has no backups yet.",
  verifyQueuedOne: "Verifying destination ({count} job queued)",
  verifyQueuedMany: "Verifying destination ({count} jobs queued)",
  integrityQueuedOne: "Integrity check queued ({count} job) - this re-reads the data and may take a while",
  integrityQueuedMany: "Integrity check queued ({count} jobs) - this re-reads the data and may take a while",
  mirrorSelf: "A destination can't mirror to itself",
  mirrorTargetNotFound: "Mirror target not found",
  mirrorLoop: "That would create a mirror loop (A → B → A)",
  resticNoPassword: 'Destination "{name}" uses restic but has no repository password',

  // Schedules
  pickDestination: "Pick a destination",
  invalidCron: 'Invalid cron expression "{cron}" (5 fields: minute hour day month weekday)',
  unknownMode: "Unknown backup mode",
  invalidRetention: "Retention ({period}) must be a whole number between 0 and 1000",
  retentionPeriod: { daily: "daily", weekly: "weekly", monthly: "monthly" },

  // Hooks
  hookTooLong: "A hook command is too long (max 4000 characters)",
  hookTimeoutInvalid: "A hook time limit must be a whole number of seconds between 1 and 3600",

  // Backups, restores, drills
  backupQueued: "Backup queued",
  restoreQueued: "Restore queued",
  restoreNewQueued: "Restore → new queued",
  drillQueued: "Test restore queued",
  snapshotStillRunning: "This backup is still running - cancel it first.",
  noCommitToRepin: "This snapshot has no concrete commit to re-pin to",
  repinned: "Re-pinned to {sha} and redeploying",
  backupInProgress: "A backup of {name} is already in progress - wait for it to finish.",
  restoreInProgress: "An in-place restore of {name} is in progress - wait for it to finish.",
  noDestination: "No destination configured",
  noAgentForBackup: 'No online agent on server "{server}" to back up {name}. Install the agent on that server.',
  noAgentForRestore: 'No online agent on server "{server}" to restore {name}.',
  noAgentOnTarget: "No online agent on the target instance to restore {name} onto - install one there first.",
  localCrossInstance:
    "This snapshot is stored on a 'local' destination (files on the source host), so it can't be restored onto another instance. Use an SSH/S3 destination.",
  noManifestRestore: "Snapshot has no manifest; cannot restore",
  controlPlaneNoClone: 'A Coolify control-plane backup can only be restored in place, not "→ new".',
  cloneUnsupportedType: 'Restore → new resource is not supported for type "{type}"',
  appCantClone: 'Application "{name}" can\'t be "→ new" cloned (no git repo and no docker image)',
  serviceCantClone: 'Service "{name}" can\'t be cloned automatically (no compose exposed by the API)',
  drillNeedsSuccess: "Only a successful snapshot can be test-restored",
  noManifestDrill: "Snapshot has no manifest; cannot test-restore",
  configOnlyNoDrill: "This snapshot holds the configuration only (no data): there is nothing to test-restore",
  configOnlyNoInPlace: "This snapshot holds the configuration only (no data): use Clone to recreate the resource",
  drillLocalAgentOffline: "The agent that holds this local snapshot is offline - it must run the test restore.",
  drillNoAgent: "No online agent to run the test restore.",

  // Users & invitations
  pickRole: "Pick a role",
  userExists: "A user with that email already exists",
  missingInviteToken: "Missing invite token",
  inviteInvalid: "This invitation link is invalid or already used.",
  inviteExpired: "This invitation link has expired.",
  unknownRole: "Unknown role",
  userNotFound: "User not found",
  agentSettingsSaved: "Agent settings saved - agents apply them within about 30 seconds",
  agentSettingsInvalid: "Invalid agent setting: {field}",
  twoFactorResetSelf: "Manage your own two-factor sign-in from your Profile.",
  twoFactorReset: "Two-factor sign-in reset - they'll set it up again at their next sign-in if required",
  twoFactorPolicyInvalid: "Unknown two-factor policy",
  lastAdminDemote: "You can't demote the last admin.",
  cantRemoveSelf: "You can't remove your own account here.",
  lastAdminRemove: "You can't remove the last admin.",

  // API tokens
  tokenNameRequired: "Give the token a name",
};

export const fr: typeof en = {
  noPermission: "Vous n'avez pas l'autorisation de faire ceci.",

  invalidTimezone: "Fuseau horaire invalide",
  webhookUrlInvalid: "Saisissez une URL http(s) valide, ou laissez vide pour désactiver",
  webhookUrlFirst: "Saisissez d'abord une URL http(s) valide",
  testNotificationSent: "Notification de test envoyée",
  webhookRejected: "Le webhook n'a pas accepté le message",

  passwordFieldsRequired: "Saisissez votre mot de passe actuel et le nouveau",
  newPasswordTooShort: "Le nouveau mot de passe doit comporter au moins 8 caractères",
  newPasswordMismatch: "Le nouveau mot de passe et sa confirmation ne correspondent pas",
  changePasswordFailed: "Impossible de changer le mot de passe",
  invalidEmail: "Saisissez une adresse e-mail valide",
  changeEmailFailed: "Impossible de changer l'e-mail",
  checkInbox: "Consultez votre boîte de réception actuelle pour confirmer le changement.",
  emailInUse: "Cette adresse e-mail est déjà utilisée",
  nameRequired: "Saisissez votre prénom et/ou votre nom",
  updateNameFailed: "Impossible de mettre à jour votre nom",

  fromInvalid: "L'expéditeur doit être une adresse e-mail valide",
  smtpNotConfigured: "Renseignez au moins l'hôte SMTP et une adresse d'expéditeur, enregistrez, puis testez.",
  smtpConnectFailed: "Échec de la connexion SMTP : {error}",
  smtpSendFailed: "Connecté, mais l'envoi a échoué : {error}",
  testEmailSent: "E-mail de test envoyé à {to}",
  smtpRequiredForVerification:
    "Configurez et testez d'abord le SMTP - la vérification nécessite un envoi d'e-mails fonctionnel.",
  smtpNotWorking: "Le SMTP ne fonctionne pas : {error}",

  pickDestinationFirst: "Choisissez d'abord une destination",
  destinationNotFound: "Destination introuvable",
  localDiesWithMachine: "Une destination « local » meurt avec la machine - choisissez SSH ou S3",
  selfBackupEnabled: "Auto-sauvegarde activée - première exécution d'ici une minute",
  selfBackupDisabled: "Auto-sauvegarde désactivée",
  metadataBackedUp: "Métadonnées sauvegardées",
  selfBackupNotConfigured: "L'auto-sauvegarde n'est pas configurée",
  selfBackupDestGone: "La destination configurée pour l'auto-sauvegarde n'existe plus",
  notAPgDump: "Le fichier déchiffré n'est pas un pg_dump valide - la sauvegarde est peut-être corrompue",
  recoveryCheckFailed: "Échec de la vérification du chemin de récupération : {error}",
  recoveryPathWorks:
    "Dernière auto-sauvegarde récupérée et déchiffrée ({size} Ko) - le chemin de récupération fonctionne.",
  recoveryUnauthorized: "Non authentifié",
  recoveryAdminsOnly: "Réservé aux admins",
  recoveryBadForm: "Données de formulaire multipart attendues",
  recoveryWrongPassword: "Mot de passe incorrect",
  recoveryTypeImport: "Tapez « IMPORT » pour confirmer l'écrasement de cette installation",
  recoveryNoFile: "Aucun fichier de récupération envoyé",
  recoveryNewerVersion:
    "Ce fichier de récupération a été exporté par un CBM plus RÉCENT (migration {migration}). Mettez à jour cette installation vers au moins {version}, puis importez à nouveau.",
  recoveryNotEmpty:
    "Cette installation contient déjà des instances/destinations. Cochez la case de remplacement pour tout écraser.",
  recoveryRestoredLatest: "Dernière auto-sauvegarde restaurée depuis sa destination.",
  recoveryRestoredEmbedded:
    "La destination de l'auto-sauvegarde était injoignable - le dump inclus dans le fichier de récupération a été restauré.",
  recoveryImportFailed: "Échec de l'import de récupération - consultez les journaux du contrôleur.",
  recoveryExportFailed: "Impossible de générer le fichier de récupération - consultez les journaux du contrôleur.",

  allFieldsRequired: "Tous les champs sont obligatoires",
  cannotReachCoolify: "Impossible de joindre Coolify : {error}",
  connectedSyncFailed: "Connecté, mais la synchronisation a échoué : {error}",
  coolifyBackupQueued: "Sauvegarde de Coolify en file d'attente",
  baseUrlRequired: "L'URL de base est obligatoire",
  instanceNotFound: "Instance introuvable",
  cannotReachCoolifyAt: "Impossible de joindre Coolify à {url} : {error}",
  repointedSyncFailed: "Instance redirigée, mais la synchronisation a échoué : {error}",
  repointed: "L'instance pointe désormais vers {url}",

  agentNotFound: "Agent introuvable",

  nameAndTypeRequired: "Nom et type obligatoires",
  unknownDestinationType: "Type de destination inconnu",
  destinationInUse:
    "Encore utilisée par {count} planification(s) : {names}. Faites-les d'abord pointer vers une autre destination.",
  localTestInfo:
    "Les dossiers locaux se trouvent sur l'hôte de chaque agent ({path}) - utilisez Vérifier pour les contrôler depuis les agents.",
  sshTestOk: "Connecté à {host}:{port}, {count} entrées dans {path}",
  sshTestOkVia: "Connecté à {host}:{port} via {jump}, {count} entrées dans {path}",
  s3TestOk: "Bucket {bucket} joignable ({count} objets d'exemple)",
  noAgentForCheck:
    "Aucun agent en ligne pour lancer la vérification - démarrez l'agent sur l'hôte qui détient ces sauvegardes.",
  nothingToVerify: "Rien à vérifier - cette destination n'a encore aucune sauvegarde.",
  nothingToCheck: "Rien à contrôler - cette destination n'a encore aucune sauvegarde.",
  verifyQueuedOne: "Vérification de la destination ({count} tâche en file d'attente)",
  verifyQueuedMany: "Vérification de la destination ({count} tâches en file d'attente)",
  integrityQueuedOne:
    "Contrôle d'intégrité en file d'attente ({count} tâche) - il relit les données et peut prendre un moment",
  integrityQueuedMany:
    "Contrôle d'intégrité en file d'attente ({count} tâches) - il relit les données et peut prendre un moment",
  mirrorSelf: "Une destination ne peut pas être son propre miroir",
  mirrorTargetNotFound: "Destination miroir introuvable",
  mirrorLoop: "Cela créerait une boucle de miroirs (A → B → A)",
  resticNoPassword: "La destination « {name} » utilise restic mais n'a pas de mot de passe de dépôt",

  pickDestination: "Choisissez une destination",
  invalidCron: "Expression cron invalide « {cron} » (5 champs : minute heure jour mois jour-de-semaine)",
  unknownMode: "Mode de sauvegarde inconnu",
  invalidRetention: "La conservation ({period}) doit être un nombre entier entre 0 et 1000",
  retentionPeriod: { daily: "quotidienne", weekly: "hebdomadaire", monthly: "mensuelle" },

  hookTooLong: "Une commande de hook est trop longue (4000 caractères max.)",
  hookTimeoutInvalid: "La limite de temps d'un hook doit être un nombre entier de secondes entre 1 et 3600",

  backupQueued: "Sauvegarde en file d'attente",
  restoreQueued: "Restauration en file d'attente",
  restoreNewQueued: "Restauration → new en file d'attente",
  drillQueued: "Test de restauration en file d'attente",
  snapshotStillRunning: "Cette sauvegarde est toujours en cours - annulez-la d'abord.",
  noCommitToRepin: "Ce snapshot n'a pas de commit précis sur lequel ré-épingler",
  repinned: "Ré-épinglé sur {sha}, redéploiement en cours",
  backupInProgress: "Une sauvegarde de {name} est déjà en cours - attendez qu'elle se termine.",
  restoreInProgress: "Une restauration sur place de {name} est en cours - attendez qu'elle se termine.",
  noDestination: "Aucune destination configurée",
  noAgentForBackup:
    "Aucun agent en ligne sur le serveur « {server} » pour sauvegarder {name}. Installez l'agent sur ce serveur.",
  noAgentForRestore: "Aucun agent en ligne sur le serveur « {server} » pour restaurer {name}.",
  noAgentOnTarget:
    "Aucun agent en ligne sur l'instance cible pour y restaurer {name} - installez-en un d'abord.",
  localCrossInstance:
    "Ce snapshot est stocké sur une destination « local » (fichiers sur l'hôte source) : il ne peut donc pas être restauré sur une autre instance. Utilisez une destination SSH/S3.",
  noManifestRestore: "Le snapshot n'a pas de manifeste ; restauration impossible",
  controlPlaneNoClone:
    "Une sauvegarde du plan de contrôle Coolify ne peut être restaurée que sur place, pas « → new ».",
  cloneUnsupportedType: "La restauration → new n'est pas prise en charge pour le type « {type} »",
  appCantClone:
    "L'application « {name} » ne peut pas être clonée « → new » (ni dépôt git ni image docker)",
  serviceCantClone:
    "Le service « {name} » ne peut pas être cloné automatiquement (aucun compose exposé par l'API)",
  drillNeedsSuccess: "Seul un snapshot réussi peut faire l'objet d'un test de restauration",
  noManifestDrill: "Le snapshot n'a pas de manifeste ; test de restauration impossible",
  configOnlyNoDrill: "Ce snapshot ne contient que la configuration (aucune donnée) : il n'y a rien à tester",
  configOnlyNoInPlace: "Ce snapshot ne contient que la configuration (aucune donnée) : utilisez Cloner pour recréer la ressource",
  drillLocalAgentOffline:
    "L'agent qui détient ce snapshot local est hors ligne - c'est lui qui doit lancer le test de restauration.",
  drillNoAgent: "Aucun agent en ligne pour lancer le test de restauration.",

  pickRole: "Choisissez un rôle",
  userExists: "Un utilisateur avec cet e-mail existe déjà",
  missingInviteToken: "Jeton d'invitation manquant",
  inviteInvalid: "Ce lien d'invitation est invalide ou a déjà été utilisé.",
  inviteExpired: "Ce lien d'invitation a expiré.",
  unknownRole: "Rôle inconnu",
  userNotFound: "Utilisateur introuvable",
  agentSettingsSaved: "Réglages des agents enregistrés - ils s'appliquent sous 30 secondes environ",
  agentSettingsInvalid: "Réglage d'agent invalide : {field}",
  twoFactorResetSelf: "Gérez votre propre double authentification depuis votre Profil.",
  twoFactorReset: "Double authentification réinitialisée - la personne la reconfigurera à sa prochaine connexion si c'est requis",
  twoFactorPolicyInvalid: "Règle de double authentification inconnue",
  lastAdminDemote: "Vous ne pouvez pas rétrograder le dernier admin.",
  cantRemoveSelf: "Vous ne pouvez pas supprimer votre propre compte ici.",
  lastAdminRemove: "Vous ne pouvez pas supprimer le dernier admin.",

  tokenNameRequired: "Donnez un nom au jeton",
};
