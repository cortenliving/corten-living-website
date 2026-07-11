# Corten Living website — Instant Quote prototype

This update adds the first working **Instant Quote** dashboard to the Corten Living website.

## What is included

- `instant-quote.html` — customer quote dashboard
- DXF drag-and-drop and file browser
- Browser-based geometry reading for common 2D ASCII DXF entities
- Drawing preview, overall dimensions, cut length and estimated pierces
- Material, thickness, quantity, lead-time and process options
- Live NZD estimate with GST
- Quote drafts saved in the visitor's browser
- Email-ready quote summary
- Instant Quote links added throughout the existing website

## Upload this update to GitHub

1. Download and unzip this folder.
2. Open the `corten-living-website` repository on GitHub.
3. Select **Add file → Upload files**.
4. Drag **everything inside this folder** into GitHub, including the `assets` folder.
5. GitHub will show the existing files as replacements and the Instant Quote files as new files.
6. Use the commit message: `Add Instant Quote prototype`.
7. Click **Commit changes**.

Cloudflare Pages should automatically deploy the update after the GitHub commit.

## Important prototype limits

- Pricing values are placeholders and must be calibrated against real machine, material and labour costs.
- Geometry support currently targets common 2D ASCII DXFs: LINE, ARC, CIRCLE, LWPOLYLINE and basic POLYLINE entities.
- This version estimates one active part at a time. Multi-part cart totals come in the next stage.
- Uploaded drawings stay in the customer's browser. No files are currently sent to Cloudflare or stored online.
- Checkout, customer accounts, payments, PDF quotes and admin pricing controls are planned later.
- Every price is shown as a budget estimate until manually confirmed.

## Test it

Open `instant-quote.html` and click **Try sample part**, or upload an ASCII DXF exported in millimetres.
