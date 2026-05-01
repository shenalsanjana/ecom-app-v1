# Policy Pages Design Spec

**Date:** 2026-05-01
**Status:** Approved

## Overview

Add legal policy pages required for PayHere payment integration. Three pages needed: Refund Policy, Privacy Policy, Terms & Conditions.

## Pages

| Route | Purpose |
|-------|---------|
| `/refund-policy` | Return/refund/exchange policy |
| `/privacy-policy` | Data collection and usage |
| `/terms-and-conditions` | Website usage terms |

## Content

- Replace `[Your eCommerce Website]` with "Shoply"
- Return window: **14 days** (changed from 30)
- Refund processing: 5-7 business days
- Exchange window: 14 days

## Layout

- Max content width: `max-w-3xl`
- Centered content with prose styling
- Consistent header/footer (SiteHeader, SiteFooter)
- Breadcrumb optional but recommended

## Footer Integration

Add "Legal" section to SiteFooter with links:
- Refund Policy → `/refund-policy`
- Privacy Policy → `/privacy-policy`
- Terms and Conditions → `/terms-and-conditions`

## Cart Integration

In CartSummary component, add policy links above "Proceed to checkout":
- Small text, muted color
- Links: "By completing your purchase, you agree to our Terms and Conditions"

## Implementation Order

1. Create `app/refund-policy/page.tsx`
2. Create `app/privacy-policy/page.tsx`
3. Create `app/terms-and-conditions/page.tsx`
4. Update SiteFooter with Legal links
5. Add policy links to CartSummary