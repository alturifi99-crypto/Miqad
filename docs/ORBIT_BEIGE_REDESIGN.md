# Orbit White & Beige — approved direction 2

Implemented on `render-setup`. No schema changes, resets, data migration, or production environment changes.

- Server builds a new seating shell: horizontal two-link navigation, event header, interactive canvas, independent left tool dock, search, selected-row controls and actual seat inspector. It reuses existing application hooks and APIs to preserve bookings and saved records. Hidden compatibility nodes remain for legacy features; daily navigation exposes only seating and guests.
- `premium.css` defines shared colors, typography, forms, buttons, dialogs, tables and states for seating, guests, authentication, account security and administrative console. White `#FFFFFF`, beige canvas `#F7F4EE`, soft beige `#F0E8DB`, dark tan action `#80674D`, charcoal-brown text `#302B25`.
- Click a seat to select and inspect; use the inspector to edit, move or release. Existing drag/touch/keyboard move and explicit swap confirmation remain. Select a row for actual +/- and deletion controls in the dock. Add-row and zoom/fullscreen remain on the canvas. Row selection sends no data writes.
- iPhone: full-width content, header hamburger opens an overlaid right drawer, with controls and details below the canvas, bounded internal canvas/table scrolling and accessible touch sizes. Desktop uses actual horizontal navigation, not a collapsed sidebar.
- Guest page remains a separate four-data-column document, with autosave, search and Excel paste; original guest attributes/relationships remain preserved by existing backend.
- Auth now has a full-width brand masthead, white form area and beige visual area; all existing genuine auth forms, password reveal, validation, generic recovery and security onboarding remain wired. Fixed stale pilot hint selector discovered by screenshot review.
- Company management is reachable by owner/admin from account menu via `/console?manage=1&tenant=...`. Privileged tabs live outside daily navigation. Platform tab is shown only for `platformAdmin` returned for the authenticated user. Backend remains the authority for every action. Only owners can use membership-edit controls, matching the API. Admin tab selection persists through refresh.

## Validation

- 40 backend tests: RLS, cross-company access, authentication, session/OTP/reset replay, roles, swaps and preserved guest relationships.
- `test/minimal-browser.cjs`: real local pilot login with fake email provider, actual scoped save APIs, row/chair add/reduce/delete protection, seat inspector/edit, guest sheet autosave/reload/Excel/conflicts, desktop top navigation geometry, mobile 390px zoom/drawer/no document overflow, owner/admin/viewer administration access and member-control restrictions. Screenshots `/tmp/miqad-orbit-*.png`.
- `test/auth-design-browser.cjs`: desktop/tablet/phone login/signup/forgot/reset, password visibility, remembered email, legal consent and one-use reset. Screenshots `/tmp/miqad-auth-*.png`.
- Original `tests/browser.cjs`: drag/touch/keyboard moves and swaps, cancellation, all guest fields, rows/settings/persistence, legacy backups, safe rendering, stale storage and 320/390/768/1440 widths.

## Deployment verification

Push only `render-setup`. Render may auto-deploy; otherwise Manual Deploy → Deploy latest commit. Verify the commit hash on Live deployment and `/seating`, `/guests`, `/console` have `body[data-design="orbit-beige-v1"]` and load `/premium.css`. Public-site network access from the execution environment may be restricted; do not claim published UI inspected if only local browser tests ran.
