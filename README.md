# Corten Living website — editable Pricing Settings

This version adds a browser-based **Pricing Settings** dashboard for the Corten Living **Instant Quote** prototype.

## New in this version

- New `pricing-settings.html` dashboard page.
- Add, rename, enable, disable and remove materials.
- Edit material density, cost per kilogram and cutting factor.
- Add and remove available thicknesses for every material.
- Edit the maximum sheet width and length used by DXF sheet-fit validation.
- Edit pricing parameters:
  - machine rate per hour
  - price per pierce
  - material waste allowance
  - markup
  - GST
  - priority multiplier
  - base and minimum cutting speeds
  - pierce time
  - quantity discounts at 5, 10 and 20 items
- Instant Quote automatically reads the saved material and pricing settings.
- Download and import a JSON settings backup.
- Restore the original defaults at any time.

The previous multi-file DXF basket, individual quantities, remove buttons and sheet-size errors are all retained.

## Upload to GitHub

1. Download and unzip this folder.
2. Open the `corten-living-website` repository on GitHub.
3. Select **Add file → Upload files**.
4. Drag everything inside this folder into the repository.
5. Use the commit message: `Add editable pricing settings dashboard`.
6. Click **Commit changes**.

Cloudflare Pages should deploy the update automatically.

## How to use it

1. Open `pricing-settings.html` or select **Pricing Settings** from Instant Quote.
2. Change materials, thicknesses and calculation values.
3. Select **Save pricing settings**.
4. Return to **Instant Quote** and test with the sample DXF.

## Important prototype limits

- Pricing settings are stored in `localStorage`, so they apply only to the browser and computer where they were saved.
- The Pricing Settings page is not password protected yet.
- Different customers will not receive these settings from a central server yet.
- The production version should move the settings into a protected Cloudflare D1 database with admin authentication.
- Uploaded DXF drawings still remain in the customer’s browser and are not stored online.
- Every displayed price remains a budget estimate until manufacturability and final pricing are confirmed.


## Logo update
The website header and footer now use `corten-living-logo.png`, a transparent-background version of the approved Corten Living logo.
