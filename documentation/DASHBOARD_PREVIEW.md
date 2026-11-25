# Dashboard design preview

Local prototype, 2026-11-07. The user selected TailAdmin's React CRM demo as the visual reference; the implementation remains an isolated sample-data preview.

Validation: optimized React build passed. Browser checks cover filtering, empty/reset states, lead details, mobile navigation and page overflow at 390px. The existing HTML shell requests Google Fonts; the preview component uses system typography and makes no backend/provider requests. The preview style detector returned no findings. These checks are not a full accessibility audit.

## Run

Build the dashboard as the separate `lead-dashboard-design-preview` Docker image. Serve with the preview-only nginx configuration in `scripts/dashboard/preview.nginx.conf` mounted over `/etc/nginx/conf.d/default.conf`, publishing container port 3000 on **127.0.0.1:3001**. The preview server denies `/webhook/` and needs no application network.

Open `http://localhost:3001/design-preview`. This route is intentionally public and contains fictional records only. It does not establish authentication and must never be extended to display real organization data without the authenticated backend boundary.

## Design direction

An actions-first work queue, followed by sample search counts, stage progress and the day's outreach. The search stage strip uses per-stage counts rather than a fabricated completion percentage. Leads uses a restrained table and an addressable future detail pattern; this prototype keeps its detail selection in memory.

Pale neutral work surfaces, a wider white sidebar, blue active navigation/actions and rounded white panels follow the selected reference. Outfit is requested from Google Fonts with a system fallback. Existing operational routes retain their styling. Header search works on the fixture records; help and notification buttons explain preview limitations.

Functional preview interactions: Overview/Leads switching; name/city search; offer-fit and review filters; empty state/reset; lead evidence details; mobile navigation; dismissible notices explaining screens outside this slice. No action approves, sends, fetches or changes an organization.

The original green preview and subsequent readability refinement preceded this choice and are superseded for this surface. The current CSS is independently authored. No paid TailAdmin source, logo or CRM assets were downloaded or incorporated, and no purchase was made.

## Reference and edition check

- Selected demo: https://react-demo.tailadmin.com/crm
- Official comparison: https://github.com/TailAdmin/free-react-tailwind-admin-dashboard#feature-comparison
- The official repository lists CRM among Pro dashboards. The MIT free edition includes sidebar, basic tables/charts, authentication forms and common controls.
- The free template's current React 19 / TypeScript / Tailwind stack differs from our React 18 / react-scripts app. This preview does not migrate the framework or replace the backend to adopt the appearance.
- A screenshot of the rendered public reference was captured locally after waiting for actual CRM content, not merely page load. Reference screenshots are local review evidence, not shipped product assets.

## Boundaries

Only sample data is shown; even the organization and activity counts are fictional. Provider verification is not implied by an email being found. Failed website fetches remain ambiguous. Later API integration must supply actual fit, evidence, job progress, permissions and entitlements.

The working dashboard container is not replaced. The separate preview container is disposable. Remove it when review ends; rebuild the preview image to see source changes.
