# Simple shop POS catalogue

The register currently repeats every colour/size as a card and stops after 60
options. The live catalogue contains 42 products and 357 options, so the opening
view represents only five products.

Show the complete published catalogue grouped by the existing inventory
categories, with the storefront department as a fallback. Use category buttons
with product counts, compact cards shown once per product, and local name/SKU
search. Selecting a product opens a small colour/size chooser; a single-option
product adds directly. Disable sold-out choices and require an explicit size
when several sizes exist. Keep the current sale and payment form alongside it.

Retain SKU scanning, cart recovery, pending-sale retry protection, authoritative
server stock/price checks, and the existing cash/card checkout. Refresh stock
from the server after sales or an explicit refresh. Fetch only the fields needed
for the register; no schema or catalogue-data changes are required.

Validate category grouping, complete option coverage, search, chooser behaviour,
scanner, cash/card, retries and mobile layout. Run checks and build sequentially
inside containers with memory/CPU limits and stop if host memory becomes low.
Verify the candidate before replacing only the app, retaining a rollback image.
