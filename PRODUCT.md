# Lead generation and management

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Small and medium organizations seeking business customers, including software houses offering websites to clinics. Organization owners and their teams request leads, inspect evidence, manage campaigns and review outreach.

## Product Purpose

Gather businesses, clean their contact data, enrich them with sourced evidence, prepare outreach strategies and manage channel execution and follow-up. Customers can monitor continuous background processing from the dashboard.

## Operating Context

The existing React 18 dashboard runs in Docker alongside n8n and PostgreSQL. Continue this dashboard; Flutter integration was discontinued. Pakistan and US markets are in scope; the current calling development targets the US, with Pakistan routing unverified.

## Capabilities and Constraints

- Organization-scoped access and billing; authenticated identity must establish membership. Never trust a client-provided org_id alone.
- Preserve existing leases, provider budgets, BYOK/platform billing, approvals and hash-bound strategy plans.
- Customers can connect their own provider accounts and senders where supported; customer onboarding and production readiness vary by provider.
- Google sign-in and email/password were requested. The user selected Firebase Authentication on Spark and supplied the web configuration for `lead-gen-system-fad55`. The local client initializes successfully; server credential, verified membership gateway and real login integration remain pending.
- Outreach channels include email, manual LinkedIn assistance, calls and WhatsApp; SMS completion and channel readiness must be checked against the backend before exposing actions.
- No sending, provider spending, activation or backend restructuring follows merely from dashboard design work.
- Commercial package decision (18 November 2026): Free includes email, manual LinkedIn, manual WhatsApp and manual Messenger. Plus adds SMS, calling and official WhatsApp automation when ready. See `documentation/FREE_PLUS_PACKAGES_20261118.md`; organization-level feature enforcement is installed locally; pricing and payment billing remain pending. Customer-owned provider accounts and separately funded Managed Calling remain supported. Provider credits do not grant Plus access or platform-funded resources. The earlier Freemium/Standard/Premium numeric quota proposal remains superseded. Preserve operational checks; do not invent prices or grant credits.
- Public privacy and deletion pages currently live on the temporary StudyHub host; move them to the dashboard's public HTTPS host when available.

## Brand Commitments

Simple, understandable navigation and an intentional professional interface. The user selected TailAdmin's React CRM demo as the visual reference on 2026-11-07: pale neutral workspace, white panels, blue accents, Outfit typography and a clear sidebar. Adapt this direction to the lead workflow. Final product name and logo remain undecided; do not use TailAdmin's brand as our product identity.

## Evidence on Hand

Existing dashboard source, workflow JSON files, migrations and stage documentation in this repository. Source files establish implementation intent, not proof of deployment or successful live operation. Do not fabricate results, verified contacts, delivery, conversion rates or customer testimonials.

## Product Principles

- Make required customer actions clear while background work continues.
- Distinguish found, assessed, eligible, approved, attempted and delivered states.
- Explain why an action is unavailable and how to resolve it.
- Keep evidence, uncertainty and spending visible where they affect decisions.
- Preserve the backend's safety and organization boundaries in every interface.
