# Dashboard visual direction

Scope: `dashboard/src/pages/DesignPreview.jsx` and its stylesheet. Existing operational screens have not been restyled. User-selected reference: https://react-demo.tailadmin.com/crm (2026-11-07).

## System

- Outfit for interface typography; Segoe UI and sans-serif fallback. Font failure must not prevent use.
- Background #f9fafb, white panels, primary text #1d2939, secondary text #667085, dividers #e4e7ec.
- Brand action #465fff; pale blue #eef4ff; use the darker #3641f5 for small active text. Green #067647 on #ecfdf3 means a positive status; amber #93370d on #fffaeb means attention. Keep textual statuses alongside colors.
- Desktop sidebar 270px, compact desktop 225px; mobile uses an explicit menu. Six main sections remain the information architecture.
- Panel corners 16px, controls 8–10px. Thin borders define panels; avoid decorative shadows. Tables prioritize names, fit, evidence and readiness.
- Readable hierarchy: page heading 28px, panel heading 18px, business/action text 14–16px, secondary text 12–14px. Counts use tabular numerals.

## Product-specific composition

Keep required actions before sample counts and ongoing work. No revenue, conversion or trend graphics without supporting data. In the preview, all counts and records are labelled illustrative. A business's fit for an offer must remain distinct from contact verification and permission to send.

## Interaction and accessibility

Visible focus, restrained hover colors, semantic controls and text labels. Mobile tables scroll inside their container, not the whole page. Motion is limited to color feedback and respects reduced-motion preference. Do not imply live notifications, search results or approvals in the fixture preview.

## Adoption boundary

This is an independent implementation inspired by the user's selected reference, not an installation of TailAdmin Pro. Final production integration must preserve existing leases, budgets, approvals and organization access. Do not replace application libraries merely to match the reference's stack.
