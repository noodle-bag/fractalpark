# Production Enablement & Rollback — Web Creation Loop

The cloud creation loop ships **dark**: every route and UI entry fails
closed while `FRACTALPARK_CREATION_CLOUD_ENABLED` is unset. This runbook is
the gate between "merged to main" and "users can sign in". The production
Supabase project is NOT authorized yet — creating it is step 0 and belongs
to the maintainer.

## 0. Prerequisites (human decisions)

- [ ] Production Supabase project created (region chosen deliberately).
- [ ] Production Vercel environment confirmed.
- [ ] Legal pages reviewed and signed off (Privacy / Terms / Community
      Rules — the professional-review gate).
- [ ] CHANGELOG 0.4.15 read once end to end.

## 1. Database

- [ ] `supabase link --project-ref <prod-ref>` (ephemeral; unlink after).
- [ ] `npm run db:migrate -- --linked` — rolls every migration forward
      (roles, RLS, RPCs, triggers, buckets).
- [ ] `npm run db:preflight -- --linked` — schema fingerprint must equal
      staging.
- [ ] Dashboard → Database → Backups: confirm automatic backups exist.
- [ ] Schedule the logical export (`npm run backup:cloud
      --mode=management`) per docs/runbooks/cloud-backup-recovery.md and
      store exports off-box.

## 2. Email

- [ ] GoTrue custom SMTP configured (Authentication → SMTP) — the default
      shared sender is rate-limited and lands in spam; OTP sign-in depends
      on this. FractalPark uses `smtp.feishu.cn:465` with
      `noreply@fractalpark.com`.
- [ ] GoTrue mailer template switched from the default magic link to the
      sign-in code — without this the OTP email contains a link to the
      homepage and NO code (verified the hard way on 2026-08-03). Copy the
      staging values: subject `Your FractalPark sign-in code`, body
      containing `{{ .Token }}` in a large font, plus
      `mailer_autoconfirm=true`, `mailer_otp_length=6`,
      `mailer_otp_exp=3600`. All via `PATCH
      /v1/projects/{ref}/config/auth`.
- [ ] `FRACTALPARK_SMTP_*` set for the backup-email channel (separate
      credentials from GoTrue's, per spec 9).
- [ ] `FRACTALPARK_ARTWORK_EMAIL_BACKUP_ENABLED` left **unset** until the
      first real backup email has been smoke-tested on staging.
- [ ] Send one OTP to a real mailbox; confirm delivery time and spam
      folder behavior — and that the email shows a six-digit code.

## 3. Application environment (Vercel)

- [ ] `FRACTALPARK_CREATION_CLOUD_ENABLED=true`
- [ ] `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
      `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- [ ] `FRACTALPARK_SESSION_ENCRYPTION_KEY` — fresh 32-byte key, never
      reused from staging
- [ ] `FRACTALPARK_RATE_LIMIT_HMAC_KEY` — same rule
- [ ] `CRON_SECRET` — protects the internal health-check endpoint
      (`/api/creation/internal/smtp-probe`); schedule a monitored ping
      against it so a dead SMTP channel pages a human instead of
      surfacing as user-facing backup-email failures.
- [ ] Schedule the cleanup worker (`npm run cleanup:worker` one pass per
      run) on a short interval — it is a manual script, not a daemon;
      nothing drains thumbnail jobs or finalizes deletions until it runs.
      Interval guidance: 5–15 minutes.
- [ ] Auth → URL Configuration: site URL + redirect allow-list match the
      production domain exactly.

## 4. Enable smoke (in order)

1. Sign in with a real mailbox (OTP arrives < 1 min).
2. Save a cloud draft; reload; draft present. Open a second browser:
   draft present there too.
3. Publish one artwork; it appears in Community; public page renders.
4. Withdraw it; public page 404s.
5. Turn on backup email (staging first); publish; attachment arrives.
6. Delete the test account; drafts gone, sessions dead, audit row kept.
7. Run `scripts/e2e-hardening-matrix.ts` against **staging** (it needs
   mailbox access for OTP codes, so it cannot run against production
   mailboxes; staging coverage is the contract).

## 5. Rollback

- **Fast path**: set `FRACTALPARK_CREATION_CLOUD_ENABLED` to empty and
  redeploy. Every cloud route returns 404/410 and the UI entries
  disappear; the site behaves exactly as 0.4.13. Data in Supabase is
  untouched.
- **Database rollback**: there is none by policy — migrations are
  forward-only. If a migration misbehaves, fix forward with a new one
  (see the parity practice in the PR-3 history).
- **Email rollback**: unset `FRACTALPARK_ARTWORK_EMAIL_BACKUP_ENABLED`;
  OTP sign-in is independent.

## 6. After enabling

- [ ] Watch the ops alerts in docs/runbooks/cloud-backup-recovery.md for
      the first week (cleanup jobs, deletion ops, SMTP failures, limiter
      spikes).
- [ ] Record the enablement (date, actor, smoke results) in the release
      notes.
- [ ] Tag `v0.4.15` on the merge commit and publish the GitHub Release
      from CHANGELOG 0.4.15.
