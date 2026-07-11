# Corten Living website — Instant Quote multi-file update

This update improves the **Instant Quote** dashboard so a customer can build one quote from several DXF files.

## Changes in this version

- Each uploaded DXF appears in the quote summary with:
  - a small geometry preview
  - filename and dimensions
  - its own quantity controls
  - its own estimated line price
- Each DXF can be removed individually from either its file tab or the quote list.
- The active DXF can still be opened in the large geometry preview.
- Removed the Additional Processes section.
- Removed Setup, Extras and Minimum Charge Adjustment from the calculator and quote summary.
- The subtotal, GST and estimated total now cover all DXF files in the quote.
- Saved drafts and email summaries include every DXF and its individual quantity.

## Upload to GitHub

1. Download and unzip this folder.
2. Open the `corten-living-website` repository on GitHub.
3. Select **Add file → Upload files**.
4. Drag everything inside this folder into the repository.
5. Use the commit message: `Improve Instant Quote multi-file basket`.
6. Click **Commit changes**.

Cloudflare Pages should deploy the update automatically after the GitHub commit.

## Important prototype limits

- Pricing values are placeholders and still need to be calibrated against real material, machine and labour costs.
- Geometry support currently targets common 2D ASCII DXF entities: LINE, ARC, CIRCLE, LWPOLYLINE and basic POLYLINE entities.
- Uploaded drawings remain in the customer's browser and are not yet stored online.
- Checkout, customer accounts, payments, PDF quotes and admin pricing controls are planned later.
- Every displayed price remains a budget estimate until manufacturability and final pricing are confirmed.

## Test it

Open `instant-quote.html`, click **Try sample part** more than once, then use the plus/minus controls and remove buttons in the quote summary.
