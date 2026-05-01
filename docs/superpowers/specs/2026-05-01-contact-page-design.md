# Contact Us Page Update — Design Spec

## Date: 2026-05-01

## Overview
Add "Contact Us" button to the site header and redesign the contact page to match the reference site (noirellepremium.com/pages/contact), including a functional contact form with email notification.

---

## 1. Header Update

**File:** `app/_components/home/site-header.tsx`

**Change:** Add "Contact Us" to the `NAV_LINKS` array.

```typescript
const NAV_LINKS = [
  { href: "#", label: "Shop" },
  { href: "#", label: "Categories" },
  { href: "#", label: "Deals" },
  { href: "/contact", label: "Contact Us" },
];
```

- Position: Last in the nav links list
- Style: Same as existing nav links (muted text, hover → foreground)
- Link: `/contact`

---

## 2. Contact Page Redesign

**File:** `app/contact/page.tsx`

### Hero Section
- Centered heading: "We'd love to hear from you"
- Subtext: "Our dedicated team is available to assist you with any inquiries"
- Generous vertical padding (py-16 or similar)
- Optional: subtle background color or gradient

### Contact Information Cards (3-column grid)
Display contact details in a responsive 3-column grid:

| Card | Content |
|------|---------|
| **Phone** | Icon + +94 74 054 5536 (tel: link) |
| **Email** | Icon + dressingbear@gmail.com (mailto: link) |
| **Hours** | Icon + "Monday – Saturday 9:00 AM – 6:00 PM (Sri Lanka Time)" |

- Card styling: Rounded corners, subtle border, hover shadow effect
- Icons: Use Lucide icons (Phone, Mail, Clock)

### Contact Form
Fields:
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Name | text | No | Optional |
| Email | email | Yes | Validation |
| Phone Number | tel | No | Optional |
| Message | textarea | Yes | Multi-line |

- Button: "Send" with primary styling
- reCAPTCHA note below button (decorative text)

### Form Submission
**Client-side:** Show inline success message after submission
**Server-side:** Send email via Resend API to dressingbear@gmail.com

Email content:
- Subject: "New Contact Form Submission"
- Body: Name, Email, Phone, Message fields

---

## 3. Success State

After form submission:
- Hide form or show "Thanks for reaching out! We'll get back to you soon."
- Display confirmation message in place of the form

---

## 4. Email Setup

**Package:** `@react-email/components` (for email template)

**API Route:** `app/api/contact/route.ts`
- Method: POST
- Action: Send email via Resend
- Body: `{ name, email, phone, message }`

**Environment Variables (`.env.local`):**
```
RESEND_API_KEY=re_xxxxx
CONTACT_EMAIL_TO=dressingbear@gmail.com
```

---

## 5. Dependencies

Install if not already present:
- `resend` — Email service
- `@react-email/components` — Email HTML rendering

---

## 6. File Changes Summary

| File | Action |
|------|--------|
| `app/_components/home/site-header.tsx` | Add "Contact Us" to NAV_LINKS |
| `app/contact/page.tsx` | Full redesign with hero, cards, form |
| `app/contact/actions.ts` | Server actions for form submission |
| `app/api/contact/route.ts` | API route for sending email |
| `.env.local` | Add RESEND_API_KEY, CONTACT_EMAIL_TO |

---

## 7. Reference Site Design Elements

From noirellepremium.com/pages/contact:
- ✅ Hero section with welcoming text
- ✅ 3 contact info cards (phone, email, hours)
- ✅ Contact form with Name, Email, Phone, Message
- ✅ Success message on submission
- ✅ Email notification to business address
