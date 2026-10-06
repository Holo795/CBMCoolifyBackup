# Email (SMTP)

Email is **optional**. Configure it to enable:

- **Password reset** — a *Forgot password?* link on the sign-in page.
- **Account verification** — an optional soft check (a link is emailed; sign-in is never
  blocked).
- **Emailed invitations** — send invite links directly instead of copy-pasting them (see
  [Accounts & roles](accounts.md)).

Without SMTP, CBM works fine — you just copy invite links by hand and reset passwords by
re-inviting.

## Configure it (UI)

**Settings → Email (SMTP)** (admin only; jump to it from the section list on the left of the
Settings page). Fill in your provider's details:

| Field | Example |
| --- | --- |
| Host | `smtp.mailgun.org` |
| Port | `587` (STARTTLS) or `465` (implicit TLS) |
| Implicit TLS (switch) | on for port 465, off for 587 |
| Username / Password | your SMTP credentials (password is write-only / stored encrypted) |
| From address | `backups@yourdomain.com` |
| From name | `CBM Backups` (optional) |

Then click **Save**, and **Send test email (establish connection)** — this opens the SMTP
connection with the saved settings, sends a test message **to your own (admin) address**, and
only marks SMTP *verified* if it succeeds. Saving again clears that flag. Until a test passes,
password reset, verification and emailed invitations stay disabled (a warning is shown).

The SMTP password is encrypted at rest with `MASTER_KEY` (see [Security](security.md)); it's
never sent back to the browser.

## Configure it (env / config-as-code)

For docker-compose / Coolify deployments you can set SMTP via environment variables instead.
**Any value set in env overrides the UI and locks that field** (so your config-as-code wins):

```bash
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_SECURE=false        # true for port 465 (implicit TLS)
SMTP_USER=postmaster@yourdomain.com
SMTP_PASSWORD=…
SMTP_FROM=backups@yourdomain.com
SMTP_FROM_NAME=CBM Backups
```

Locked fields show as disabled in the form. When `SMTP_HOST` comes from env, the config is
trusted (no "send test" needed). See
[Configuration](configuration.md) for the full variable reference.

## Account verification (optional)

In **Settings → Email (SMTP)**, the *Require email verification* switch turns on a **soft**
check: new users receive a verification link, and a change of email on **Profile** must be
confirmed from a link sent to the current address (if that one is verified). **Sign-in is never
blocked** — it's a reminder, not a gate. Enabling it requires a working SMTP (CBM verifies the connection first).

## Local development — Mailpit

The dev compose ships a catch-all mailer so you can test every flow offline:

```bash
docker compose -f docker-compose.dev.yml up -d   # starts Postgres + Mailpit
```

Point SMTP at Mailpit:

- **Host** `localhost`, **Port** `1025`, **Implicit TLS** off, no username/password.

Then open the Mailpit inbox at **http://localhost:8025** to read every message CBM sends
(reset links, verification, invitations) — nothing leaves your machine.
