# BPlan Legal / Business Decision Sheet

Status: **provisional implementation input — not legal sign-off**
Last reviewed: **2026-09-08**

Production paid checkout must remain disabled until the seller identity is
chosen and the final Terms and Privacy Policy are approved and published.

## Launch decisions

| Item                         | Provisional decision                                                                        | State                  |
| ---------------------------- | ------------------------------------------------------------------------------------------- | ---------------------- |
| Product                      | BPlan: Business Calendar                                                                    | Set                    |
| Seller legal name            | TBD — founder decision pending. This document does not claim an LLC or other entity exists. | Open                   |
| Jurisdiction                 | New Jersey, United States                                                                   | Working assumption     |
| Initial sales territory      | United States                                                                               | Set for initial launch |
| Public business address      | TBD — do not publish a personal or home address                                             | Open                   |
| Minimum age                  | 18+                                                                                         | Set                    |
| Currency                     | USD                                                                                         | Set                    |
| Monthly plan                 | $4.99/month                                                                                 | Set                    |
| Annual plan                  | $49.99/year                                                                                 | Set                    |
| Trial / introductory pricing | None at launch                                                                              | Set                    |
| Support                      | info.bplanai@gmail.com                                                                      | Set                    |
| Effective date               | TBD — use the launch date                                                                   | Open                   |

## Pro scope verified in the repository

The current Pro entitlement is `pro`. The Pro feature represented in the
current server path is **Find Time with AI**: deterministic server code finds
valid open slots, and the configured AI provider may rank and explain those
slots. The server checks the persisted `pro` entitlement before allowing the
feature.

The complete client purchase/paywall experience and live RevenueCat sandbox
flow are still being wired. This sheet does not describe additional Pro
features that are not present in the repository.

## Billing, cancellation, and refunds

- Billing engine: RevenueCat Billing using Stripe.
- A charged subscription generally is non-refundable, except where required
  by law or where BPlan chooses to issue a refund.
- Users cancel through the available billing-management flow. Cancellation
  stops future renewals; access continues through the current paid period.
- The exact customer-facing management URL is still a setup TODO until the
  hosted billing flow is configured.

## Account and data decisions

- Users may delete their accounts.
- BPlan may suspend or terminate accounts for abuse, fraud, security issues, or
  Terms violations.
- Users retain ownership of their calendar, task, and other user-created data.
  BPlan receives only the rights needed to provide the service.
- The current delete flow revokes connected provider grants and deletes the
  authenticated user so user-linked product rows cascade away. The repository
  does not establish a user-visible backup or third-party retention timetable;
  this must be finalized before the Privacy Policy is treated as final.

## Repository-verified privacy map

- **Account/profile:** authenticated account email plus profile name, time
  zone, clock, working hours, and planning defaults.
- **Workspace:** internal and imported calendar metadata/events, tasks, task
  lists, tags, reminders, recurrence, descriptions, and locations as entered
  by the user.
- **Google/Microsoft integrations:** provider account identifiers, email,
  scopes, sync state, and provider refresh credentials. Refresh credentials are
  stored server-side through Vault references and are not client-readable.
- **Billing:** subscription entitlement/status/expiry, provider customer
  identifier, and RevenueCat webhook event records needed to reconcile access.
- **Operations/security:** sync status, timestamps, stable IDs, error codes,
  retry data, and webhook/account-deletion audit events.
- **AI scheduling:** the current ranker sends the task title, priority,
  duration, deadline, optional scheduling note, timezone/preferences, and
  derived candidate-slot features to the configured AI provider. It does not
  send raw event descriptions, locations, attendees, OAuth tokens, or provider
  credentials. The repository configures OpenAI requests with `store: false`.

## Finalization TODOs

1. Founder chooses the seller legal name/entity and confirms the public contact
   address or the lawful alternative to publish.
2. Finalize Terms, Privacy Policy, cancellation-management URL, and retention
   language with legal review for the actual launch jurisdictions.
3. Replace the marked TBD text in the public drafts and set their effective
   date.
4. Only then may production billing flags and a production RevenueCat purchase
   link be enabled. Sandbox testing may proceed independently.
