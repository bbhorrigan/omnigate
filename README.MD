# Universal Auth Middleware for SaaS

## Solving the Fragmented Authentication Problem

SaaS authentication today is inconsistent and frustrating. Some platforms support Google OAuth, others only support GitHub, and many still rely on email/password combinations. Advanced protocols like SAML are often locked behind expensive enterprise tiers.

This inconsistency leads to:

* **Security issues** – Managing multiple credentials increases risk
* **User frustration** – Endless password resets and broken auth flows
* **Admin overhead** – SSO management across scattered systems

## The Vision: One Auth to Rule Them All

**Universal Auth Middleware** is a proxy-layer authentication engine that sits between the user and the SaaS provider. It decouples user identity from the SaaS authentication constraints.

### How it Works

1. Authenticate once using your preferred method:
   WebAuthn, GitHub OAuth, SAML, Passkeys, etc.

2. The middleware handles SaaS login using whatever method the SaaS supports

3. You gain access without having to worry about what the SaaS supports

---

## Key Features

* **Multi-Protocol Support**
  Accept WebAuthn, OIDC, SAML, etc., and convert to downstream formats

* **Credential Mapping**
  Your GitHub identity becomes whatever the SaaS needs (email, username, etc.)

* **Centralized Access Management**
  One identity, one place to manage policies and access rights

* **Protocol Translation**
  Turn your FIDO2 hardware key into an OAuth token—even if the app doesn't support it

---

## Why This Matters

| Benefit             | Description                                                            |
| ------------------- | ---------------------------------------------------------------------- |
| **User Experience** | Never see “Sign in with Google” again if you prefer GitHub             |
| **Security**        | Enforce consistent MFA and access policies across apps                 |
| **Privacy**         | Control what personal data gets shared per service                     |
| **Future-Proofing** | Add new auth methods to the middleware once—no changes needed per SaaS |

---

## Technical Architecture

**Core Components:**

* `auth-adapters/` – OAuth2, SAML, WebAuthn, OIDC handlers
* `mapping-engine/` – Translate identities and credentials
* `token-bridge/` – Convert tokens or credentials between systems
* `policy-engine/` – Enforce per-app access rules and MFA logic

---

## Status

This is a work in progress. Contributions, design feedback, and collaboration are welcome.



---

## Contact

Reach out on GitHub Discussions or email me at peter.horrigan@linux.com


