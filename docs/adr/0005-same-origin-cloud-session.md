# ADR 0005: Keep Cloud Identity Behind a Strict Same-Origin BFF Session

- Status: Accepted
- Date: 2026-08-01
- Target release: FractalPark v0.4.15

## Context

v0.4.15 adds email-OTP identity and owner-scoped cloud artwork. The
identity provider's default browser flow keeps the auth session and JWT in
the browser and lets the client call Auth and data endpoints directly.

That default conflicts with several frozen v0.4.15 requirements:

- OTP requests must pass FractalPark's email/IP HMAC rate limiting before
  the identity provider is called, and the cloud feature switch must gate
  every identity and artwork entry point.
- Browser-held tokens widen the XSS blast radius and cannot be centrally
  revoked or rotated with the same control as a server-issued cookie.
- Auth and private responses must stay out of ISR, shared CDN, and any
  cross-user cache, and session clients must be request-scoped.
- CSRF and origin checks, generic non-enumerating OTP errors, and the
  emergency disable path all need one server-side choke point.
- The locale/SEO routing middleware must not become coupled to auth token
  refresh.

## Decision

All identity and cloud artwork traffic goes through a strict backend-for-
frontend inside FractalPark's Node.js Route Handlers:

- The browser never initializes a Supabase Auth client and never holds an
  access token, refresh token, service role key, or database credential.
  OTP request, OTP verify, refresh, logout, user-scoped RPC, and admin
  operations all execute server-side.
- After OTP verification, the server seals the access token, refresh token,
  and expiry into an authenticated-encryption cookie named
  `fp_creation_session`. The cookie is fixed `HttpOnly`, `SameSite=Lax`,
  `Path=/`, and `Secure` in production, with an explicit localhost
  development exception.
- Every private request re-verifies token claims, expiry, and the cloud
  feature switch on the server. Near expiry, the server refreshes and
  atomically rotates the cookie. A client-side session object is never an
  authorization fact.
- The API layer creates its session client per request. User-scoped RPCs
  receive the verified user JWT through a dedicated user client so
  `auth.uid()` and RLS apply; the service/admin client is separate and
  cannot execute ordinary owner RPCs.
- Logout revokes the provider session first and then clears the cookie.
  Account deletion uses a separate single-use step-up proof scoped to
  `delete_account`, valid for at most 10 minutes and invalidated on use.
- Auth refresh happens only inside the Auth APIs and private-data Route
  Handlers. The locale proxy continues to own routing only.
- Content Security Policy for pages that render user-generated content is
  decided as part of this ADR's implementation: a strict default CSP with an
  explicit, tested allowance for the WebGL and inline-script requirements of
  the affected routes; UGC safety is not assumed to be covered by existing
  security headers.

## Consequences

- Losing browser storage or JavaScript state cannot leak a session; XSS
  alone cannot exfiltrate tokens from `HttpOnly` storage.
- Rate limiting, the feature switch, CSRF/origin checks, and session
  revocation share one enforcement point.
- Cookie rotation, revocation, and the emergency disable path (application
  switch plus provider email/SMTP disablement) are server operations with no
  client cooperation required.
- Every private read pays a same-origin server round trip; there is no
  client-side cached session to reuse.
- Anonymous flows never touch the session machinery and keep their current
  behavior and caching.

## Rejected Alternatives

### Browser-side Supabase Auth with default session storage

The default flow places JWTs in browser storage and encourages direct client
calls to Auth and data endpoints. It bypasses the same-origin rate-limit and
feature-switch choke point, makes token theft by XSS trivial, and couples
session lifetime to client behavior.

### Direct database access from the browser with a publishable key

Even with RLS, direct DML from the browser turns client filtering into part
of the authorization boundary and exposes the endpoint surface to
unmediated enumeration and abuse. Base tables expose no direct DML; narrow
server-mediated RPCs are the only path.

### JWT in `localStorage` behind a custom client

This keeps the XSS exposure of the default flow while adding a bespoke
session layer to audit. It offers no revocation or rotation advantage over
the sealed cookie.

### Auth refresh inside the locale middleware

Refreshing on every page pass would couple auth lifetime to SEO/locale
routing, widen the cookie-rotation surface, and make cache behavior harder
to reason about. Refresh stays inside the APIs that need it.

## Required Tests

- OTP verify issues one sealed `HttpOnly` cookie; JavaScript cannot read it.
- Every private route rejects missing, expired, revoked, and tampered
  cookies, and rejects cross-site `Origin`/`Host` mismatches on writes.
- Near-expiry requests rotate the cookie atomically; the old cookie value
  cannot be reused.
- Logout revokes the provider session; the cleared cookie cannot be
  replayed.
- Auth and private responses carry `private, no-store` and never enter ISR
  or shared caches; session clients are request-scoped.
- Ordinary owner RPCs fail under a service-role context.
- The step-up proof works only for `delete_account`, expires after 10
  minutes, and cannot be replayed after use.
- With the feature switch off, all Auth and cloud APIs return
  `cloud_disabled` and no cloud client is initialized.
- The locale middleware performs no auth refresh and leaves session cookies
  untouched on public routes.
