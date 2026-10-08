// settings — translations (timezone, failure alerts, SMTP, disaster recovery).
export const en = {
  title: "Settings",
  description: "Application-wide preferences",

  // Timezone
  timezoneTitle: "Timezone",
  timezoneDesc:
    "Used to evaluate backup schedules (cron) and to display every timestamp in the UI. Stored on the server, so it's the same for everyone - independent of each browser's timezone.",
  tzLabel: "IANA timezone",
  tzCurrentTime: "Current time in this zone:",

  // Failure alerts
  alertsTitle: "Failure alerts",
  alertsDescBefore:
    "Get notified when a backup fails. Paste a Discord or Slack webhook URL (or any endpoint that accepts a JSON ",
  alertsDescAfter: " body). Leave blank to disable.",
  alertWebhookLabel: "Webhook URL (Discord / Slack / custom)",
  alertWebhookPlaceholder: "https://discord.com/api/webhooks/…  (leave blank to disable)",
  sendTest: "Send test",

  // Email (SMTP)
  emailTitle: "Email (SMTP)",
  emailDesc:
    "Used for password reset and (optionally) account verification. Save your SMTP details, then send a test email to confirm they work.",
  emailNotReadyPre: "SMTP isn't configured or verified yet - ",
  emailNotReadyPasswordReset: "password reset",
  emailNotReadyMid: " and ",
  emailNotReadyVerification: "account verification",
  emailNotReadyPost: " won't work until you set it up and a test email succeeds.",
  emailEnvLocked: "Some fields are set by environment variables and can't be edited here.",
  smtpHost: "Host",
  smtpPort: "Port",
  smtpImplicitTls: "Implicit TLS (secure connection, usually port 465)",
  smtpUsername: "Username",
  smtpPassword: "Password",
  smtpPasswordEnvPlaceholder: "(set by environment)",
  smtpPasswordUnchanged: "•••••••• (unchanged)",
  smtpFrom: "From address",
  smtpFromName: "From name (optional)",
  smtpSendTest: "Send test email (establish connection)",
  requireEmailVerification: "Require email verification",
  requireEmailVerificationDesc:
    "New users and email changes receive a verification link. Sign-in is never blocked - it's a soft reminder. Requires a working SMTP.",

  // Disaster recovery
  drTitle: "Disaster recovery",
  drDesc:
    "CBM keeps an always-current, encrypted copy of its own metadata (instances, destinations, snapshot index, keys) on a destination of your choice, so a dead machine never takes the “brain” with it.",
  drReady: "Disaster recovery is ready",
  drFinishSetup: "Finish setting up disaster recovery",
  drItemSelfBackup: "Metadata self-backup enabled",
  drItemRecoveryFile: "Recovery file downloaded and up to date",

  // Disaster recovery — self-backup form
  selfBackupNoDest:
    "Add an SSH or S3 destination first - local folders die with the machine, so they can't protect the metadata.",
  selfBackupDestLabel: "Destination (off-site recommended)",
  selfBackupEnableLabel: "Keep an always-current copy of the metadata (runs automatically after changes)",
  selfBackupLastRun: "Last run:",
  statusOk: "ok",
  statusFailed: "failed",
  backupNow: "Back up now",
  backingUp: "Backing up…",
  backupNowTitleEnabled: "Dump and upload the metadata now",
  backupNowTitleDisabled: "Enable and save first",
  verifyRecoveryPath: "Verify recovery path",
  verifying: "Verifying…",
  verifyTitle: "Download + decrypt the latest self-backup to prove it's recoverable (no restore)",

  // Disaster recovery — recovery file panel
  recoveryFileTitle: "Recovery file",
  recoveryFileDesc:
    "A single downloadable file that IS your recovery key: it carries the master key and the address of your latest self-backup. Store it in a password manager / vault. It only needs re-downloading if your master key or the self-backup destination changes.",
  recoveryFileNoSelfBackup:
    "Enable the metadata self-backup above first - the recovery file needs a destination to point at.",
  recoveryFileCurrent: "Current:",
  recoveryFileGeneration: "generation {n}",
  recoveryFileStale: "out of date - re-download ({reason})",
  recoveryFileConfirmPassword: "Confirm your password to download",
  recoveryFileAdminPassword: "Your admin password",
  generateDownload: "Generate & download",
  generating: "Generating…",
  recoveryFileDownloadNote: "Downloading generates a new file and supersedes the previous one - destroy older copies.",
  importTitle: "Import a recovery file (rebuild this install)",
  importWarnDestructive: "Destructive.",
  importWarnBody1:
    " This replaces every instance, destination, snapshot record and account with the recovery file's. After import you are signed out - sign back in with the ",
  importWarnOld: "OLD",
  importWarnBody2: " credentials from the imported install. Run this on a fresh CBM.",
  importPasswordLabel: "Your password",
  importConfirmLabel: "Type IMPORT to confirm",
  importOverrideLabel: "This install already has data - replace everything anyway",
  importOverwrite: "Import & overwrite",
  importing: "Importing…",

  // Stale reasons (recovery file)
  staleDestChanged: "self-backup destination changed",
  staleCredsChanged: "destination credentials changed",
  staleKeyChanged: "master key changed",

  // Action result messages
  saved: "Saved ✓",
  savedPlain: "Saved",
  sent: "Sent",
  done: "Done",
  verified: "Verified",
  exportFailed: "Export failed ({status})",
  recoveryDownloaded: "Recovery file downloaded - store it in a vault and destroy older copies.",
  pickFileFirst: "Pick a recovery file first",
  importFailed: "Import failed ({status})",
  importedDefault: "Imported.",
  importedSignedOut: " You are signed out now - sign back in with your OLD credentials.",

  // Restore drills
  drillsTitle: "Restore drills",
  drillsDesc:
    "Prove your backups actually restore. A drill restores a snapshot into a throwaway sandbox on an agent - databases are loaded into a network-less container of the same engine, volumes are read back - then everything is deleted. Coolify and your resources are never touched.",
  drillsToggle: "Run a drill every week",
  drillsToggleHint:
    "Saturday 05:00: each backup-enabled resource's latest snapshot is test-restored once. Drills use CPU and disk on the agent hosts. A failure sends an alert.",

  // API tokens (MCP)
  ssoTitle: "Single sign-on",
  ssoDesc: "Let users sign in with Google, GitHub, GitLab or an OpenID Connect provider (Authentik, Keycloak…). Accounts still exist by invitation only: a provider signs in a CBM user with the same email - an invited one on first use.",
  ssoName: { google: "Google", github: "GitHub", gitlab: "GitLab", oidc: "OpenID Connect (Authentik…)" },
  ssoOn: "on",
  ssoOff: "off",
  ssoFromEnv: "set by environment",
  ssoEnvLocked: "Set by environment variables on the controller: change them there (they win over this form).",
  ssoEnabled: "Offer this provider on the sign-in page",
  ssoEnabledHint: "Users then see a \"Continue with…\" button on the sign-in and invitation pages.",
  ssoCallback: "Redirect URL",
  ssoCallbackHint: "Register this exact URL at the provider (it follows BETTER_AUTH_URL).",
  ssoClientId: "Client ID",
  ssoClientSecret: "Client secret",
  ssoSecretSaved: "saved - leave empty to keep it",
  ssoGitlabUrl: "GitLab URL",
  ssoGitlabUrlHint: "A self-managed GitLab's address; empty for gitlab.com.",
  ssoIssuer: "Issuer URL",
  ssoIssuerHint: "Its /.well-known/openid-configuration is read. Authentik: the provider's \"OpenID Configuration Issuer\".",
  ssoLabel: "Button label",
  ssoLabelHint: "Shown as \"Continue with …\".",
  ssoCheck: "Check",
  ssoCopy: "Copy",
  ssoHelp: {
    google: "Google Cloud console → APIs & Services → Credentials → Create credentials → OAuth client ID (Web application). Authorized JavaScript origin: {origin}. Authorized redirect URI: the URL below.",
    github: "GitHub → Settings → Developer settings → OAuth Apps → New OAuth App. Homepage URL: {origin}. Authorization callback URL: the URL below.",
    gitlab: "GitLab → Preferences → Applications (or Admin area → Applications). Redirect URI: the URL below; Confidential; scope read_user.",
    oidc: "Authentik: Applications → Providers → Create → OAuth2/OpenID Provider, client type Confidential, redirect URI the URL below (scopes openid, email, profile), then an Application using it. Any other OpenID Connect provider works the same way.",
  },
  apiTokensTitle: "API tokens (MCP)",
  apiTokensDesc:
    "Machine tokens that let the MCP server, or any external AI agent, drive CBM over the API. A token carries its own role; the plaintext is shown once at creation.",
};

export const fr: typeof en = {
  title: "Paramètres",
  description: "Préférences de l'application",

  // Fuseau horaire
  timezoneTitle: "Fuseau horaire",
  timezoneDesc:
    "Utilisé pour évaluer les planifications de sauvegarde (cron) et afficher chaque horodatage dans l'interface. Stocké sur le serveur, donc identique pour tout le monde - indépendant du fuseau horaire de chaque navigateur.",
  tzLabel: "Fuseau horaire IANA",
  tzCurrentTime: "Heure actuelle dans ce fuseau :",

  // Alertes d'échec
  alertsTitle: "Alertes d'échec",
  alertsDescBefore:
    "Soyez notifié lorsqu'une sauvegarde échoue. Collez une URL de webhook Discord ou Slack (ou tout endpoint qui accepte un corps JSON ",
  alertsDescAfter: "). Laissez vide pour désactiver.",
  alertWebhookLabel: "URL du webhook (Discord / Slack / personnalisé)",
  alertWebhookPlaceholder: "https://discord.com/api/webhooks/…  (laissez vide pour désactiver)",
  sendTest: "Envoyer un test",

  // E-mail (SMTP)
  emailTitle: "E-mail (SMTP)",
  emailDesc:
    "Utilisé pour la réinitialisation du mot de passe et (en option) la vérification du compte. Enregistrez vos informations SMTP, puis envoyez un e-mail de test pour confirmer qu'elles fonctionnent.",
  emailNotReadyPre: "SMTP n'est pas encore configuré ou vérifié - ",
  emailNotReadyPasswordReset: "la réinitialisation du mot de passe",
  emailNotReadyMid: " et ",
  emailNotReadyVerification: "la vérification du compte",
  emailNotReadyPost:
    " ne fonctionneront pas tant que vous ne l'aurez pas configuré et qu'un e-mail de test n'aura pas abouti.",
  emailEnvLocked:
    "Certains champs sont définis par des variables d'environnement et ne peuvent pas être modifiés ici.",
  smtpHost: "Hôte",
  smtpPort: "Port",
  smtpImplicitTls: "TLS implicite (connexion sécurisée, généralement le port 465)",
  smtpUsername: "Nom d'utilisateur",
  smtpPassword: "Mot de passe",
  smtpPasswordEnvPlaceholder: "(défini par l'environnement)",
  smtpPasswordUnchanged: "•••••••• (inchangé)",
  smtpFrom: "Adresse d'expéditeur",
  smtpFromName: "Nom d'expéditeur (optionnel)",
  smtpSendTest: "Envoyer un e-mail de test (établir la connexion)",
  requireEmailVerification: "Exiger la vérification de l'e-mail",
  requireEmailVerificationDesc:
    "Les nouveaux utilisateurs et les changements d'e-mail reçoivent un lien de vérification. La connexion n'est jamais bloquée - c'est un simple rappel. Nécessite un SMTP fonctionnel.",

  // Reprise après sinistre
  drTitle: "Reprise après sinistre",
  drDesc:
    "CBM conserve une copie chiffrée et toujours à jour de ses propres métadonnées (instances, destinations, index des snapshots, clés) sur une destination de votre choix, pour qu'une machine morte n'emporte jamais le « cerveau » avec elle.",
  drReady: "La reprise après sinistre est prête",
  drFinishSetup: "Terminez la configuration de la reprise après sinistre",
  drItemSelfBackup: "Auto-sauvegarde des métadonnées activée",
  drItemRecoveryFile: "Fichier de récupération téléchargé et à jour",

  // Reprise après sinistre — formulaire d'auto-sauvegarde
  selfBackupNoDest:
    "Ajoutez d'abord une destination SSH ou S3 - les dossiers locaux meurent avec la machine, ils ne peuvent donc pas protéger les métadonnées.",
  selfBackupDestLabel: "Destination (hors-site recommandée)",
  selfBackupEnableLabel:
    "Conserver une copie toujours à jour des métadonnées (s'exécute automatiquement après les changements)",
  selfBackupLastRun: "Dernière exécution :",
  statusOk: "ok",
  statusFailed: "échec",
  backupNow: "Sauvegarder maintenant",
  backingUp: "Sauvegarde…",
  backupNowTitleEnabled: "Exporter et téléverser les métadonnées maintenant",
  backupNowTitleDisabled: "Activez et enregistrez d'abord",
  verifyRecoveryPath: "Vérifier le chemin de récupération",
  verifying: "Vérification…",
  verifyTitle:
    "Télécharger et déchiffrer la dernière auto-sauvegarde pour prouver qu'elle est récupérable (sans restauration)",

  // Reprise après sinistre — panneau du fichier de récupération
  recoveryFileTitle: "Fichier de récupération",
  recoveryFileDesc:
    "Un unique fichier téléchargeable qui EST votre clé de récupération : il contient la clé maîtresse et l'adresse de votre dernière auto-sauvegarde. Conservez-le dans un gestionnaire de mots de passe / coffre-fort. Il n'a besoin d'être retéléchargé que si votre clé maîtresse ou la destination de l'auto-sauvegarde change.",
  recoveryFileNoSelfBackup:
    "Activez d'abord l'auto-sauvegarde des métadonnées ci-dessus - le fichier de récupération a besoin d'une destination vers laquelle pointer.",
  recoveryFileCurrent: "Actuel :",
  recoveryFileGeneration: "génération {n}",
  recoveryFileStale: "périmé - retéléchargez ({reason})",
  recoveryFileConfirmPassword: "Confirmez votre mot de passe pour télécharger",
  recoveryFileAdminPassword: "Votre mot de passe admin",
  generateDownload: "Générer et télécharger",
  generating: "Génération…",
  recoveryFileDownloadNote:
    "Le téléchargement génère un nouveau fichier et remplace le précédent - détruisez les anciennes copies.",
  importTitle: "Importer un fichier de récupération (reconstruire cette installation)",
  importWarnDestructive: "Destructif.",
  importWarnBody1:
    " Cela remplace chaque instance, destination, enregistrement de snapshot et compte par ceux du fichier de récupération. Après l'import, vous êtes déconnecté - reconnectez-vous avec les ",
  importWarnOld: "ANCIENS",
  importWarnBody2: " identifiants de l'installation importée. Exécutez ceci sur un CBM vierge.",
  importPasswordLabel: "Votre mot de passe",
  importConfirmLabel: "Tapez IMPORT pour confirmer",
  importOverrideLabel: "Cette installation contient déjà des données - tout remplacer quand même",
  importOverwrite: "Importer et écraser",
  importing: "Import…",

  // Raisons de péremption (fichier de récupération)
  staleDestChanged: "la destination de l'auto-sauvegarde a changé",
  staleCredsChanged: "les identifiants de la destination ont changé",
  staleKeyChanged: "la clé maîtresse a changé",

  // Messages de résultat d'action
  saved: "Enregistré ✓",
  savedPlain: "Enregistré",
  sent: "Envoyé",
  done: "Terminé",
  verified: "Vérifié",
  exportFailed: "Échec de l'export ({status})",
  recoveryDownloaded:
    "Fichier de récupération téléchargé - conservez-le dans un coffre-fort et détruisez les anciennes copies.",
  pickFileFirst: "Choisissez d'abord un fichier de récupération",
  importFailed: "Échec de l'import ({status})",
  importedDefault: "Importé.",
  importedSignedOut: " Vous êtes maintenant déconnecté - reconnectez-vous avec vos ANCIENS identifiants.",

  // Tests de restauration
  drillsTitle: "Tests de restauration",
  drillsDesc:
    "Prouvez que vos sauvegardes se restaurent vraiment. Un test restaure un snapshot dans un bac à sable jetable sur un agent - les bases sont chargées dans un conteneur sans réseau du même moteur, les volumes sont relus - puis tout est supprimé. Coolify et vos ressources ne sont jamais touchés.",
  drillsToggle: "Lancer un test chaque semaine",
  drillsToggleHint:
    "Samedi 05:00 : le dernier snapshot de chaque ressource sauvegardée est testé une fois. Les tests consomment du CPU et du disque sur les hôtes des agents. Un échec envoie une alerte.",

  // Jetons API (MCP)
  ssoTitle: "Authentification unique",
  ssoDesc: "Permettre de se connecter avec Google, GitHub, GitLab ou un fournisseur OpenID Connect (Authentik, Keycloak…). Les comptes restent sur invitation : un fournisseur connecte l'utilisateur CBM qui a le même email - un invité à sa première connexion.",
  ssoName: { google: "Google", github: "GitHub", gitlab: "GitLab", oidc: "OpenID Connect (Authentik…)" },
  ssoOn: "actif",
  ssoOff: "inactif",
  ssoFromEnv: "défini par l'environnement",
  ssoEnvLocked: "Défini par des variables d'environnement du contrôleur : modifiez-les là-bas (elles priment sur ce formulaire).",
  ssoEnabled: "Proposer ce fournisseur sur la page de connexion",
  ssoEnabledHint: "Un bouton « Continuer avec… » apparaît alors sur les pages de connexion et d'invitation.",
  ssoCallback: "URL de redirection",
  ssoCallbackHint: "Enregistrez exactement cette URL chez le fournisseur (elle suit BETTER_AUTH_URL).",
  ssoClientId: "Identifiant client",
  ssoClientSecret: "Secret client",
  ssoSecretSaved: "enregistré - laissez vide pour le garder",
  ssoGitlabUrl: "URL de GitLab",
  ssoGitlabUrlHint: "L'adresse d'un GitLab auto-hébergé ; vide pour gitlab.com.",
  ssoIssuer: "URL de l'émetteur",
  ssoIssuerHint: "Son /.well-known/openid-configuration est lu. Authentik : « OpenID Configuration Issuer » du fournisseur.",
  ssoLabel: "Libellé du bouton",
  ssoLabelHint: "Affiché « Continuer avec … ».",
  ssoCheck: "Vérifier",
  ssoCopy: "Copier",
  ssoHelp: {
    google: "Console Google Cloud → API et services → Identifiants → Créer des identifiants → ID client OAuth (application Web). Origine JavaScript autorisée : {origin}. URI de redirection autorisé : l'URL ci-dessous.",
    github: "GitHub → Settings → Developer settings → OAuth Apps → New OAuth App. Homepage URL : {origin}. Authorization callback URL : l'URL ci-dessous.",
    gitlab: "GitLab → Préférences → Applications (ou Admin → Applications). URI de redirection : l'URL ci-dessous ; Confidentielle ; scope read_user.",
    oidc: "Authentik : Applications → Providers → Create → OAuth2/OpenID Provider, type de client Confidential, URI de redirection l'URL ci-dessous (scopes openid, email, profile), puis une Application qui l'utilise. Tout autre fournisseur OpenID Connect fonctionne de la même façon.",
  },
  apiTokensTitle: "Jetons API (MCP)",
  apiTokensDesc:
    "Jetons machine qui permettent au serveur MCP, ou à n'importe quel agent IA externe, de piloter CBM via l'API. Un jeton porte son propre rôle ; la valeur en clair n'est affichée qu'une seule fois, à la création.",
};
