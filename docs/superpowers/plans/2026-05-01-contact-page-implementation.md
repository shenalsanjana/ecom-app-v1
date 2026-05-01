# Contact Us Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Contact Us" link to header and redesign contact page to match reference site with working form and email notification

**Architecture:** 
- Use existing nodemailer setup in `app/_lib/mailer.ts` for sending contact emails
- Create server action for form submission
- Build interactive contact form with client-side state management
- Follow existing patterns for server actions and UI components

**Tech Stack:** Next.js 15, Tailwind CSS, Lucide icons, Nodemailer (existing), shadcn/ui components

---

## File Structure

| File | Action |
|------|--------|
| `app/_components/home/site-header.tsx` | Modify - Add "Contact Us" to NAV_LINKS |
| `app/contact/actions.ts` | Create - Server action for form submission |
| `app/_lib/mailer.ts` | Modify - Add sendContactEmail function |
| `app/contact/contact-form.tsx` | Create - Interactive contact form component |
| `app/contact/page.tsx` | Modify - Redesign with hero, cards, and form |

---

## Task 1: Header Update

**Files:**
- Modify: `app/_components/home/site-header.tsx:11-15`

- [ ] **Step 1: Add "Contact Us" to NAV_LINKS**

Modify the `NAV_LINKS` array in `site-header.tsx` to include Contact Us:

```typescript
const NAV_LINKS = [
  { href: "#", label: "Shop" },
  { href: "#", label: "Categories" },
  { href: "#", label: "Deals" },
  { href: "/contact", label: "Contact Us" },
];
```

- [ ] **Step 2: Verify the change**

Run: `grep -n "Contact Us" app/_components/home/site-header.tsx`
Expected: Line with `href: "/contact", label: "Contact Us"`

- [ ] **Step 3: Commit**

```bash
git add app/_components/home/site-header.tsx
git commit -m "feat(header): add Contact Us link to navigation"
```

---

## Task 2: Add Contact Email Function to Mailer

**Files:**
- Modify: `app/_lib/mailer.ts`

- [ ] **Step 1: Add sendContactEmail function to mailer.ts**

Add this function after `sendOrderConfirmationEmail`:

```typescript
export type ContactSubmission = {
  name: string;
  email: string;
  phone?: string;
  message: string;
};

export async function sendContactEmail(submission: ContactSubmission): Promise<void> {
  const transport = getTransport();
  const brandEmail = process.env.BRAND_EMAIL ?? "dressingbear@gmail.com";
  const from = process.env.SMTP_FROM ?? `${BRAND_NAME} <no-reply@example.com>`;
  
  const { name, email, phone, message } = submission;

  const text = `
New Contact Form Submission

Name: ${name || "Not provided"}
Email: ${email}
Phone: ${phone || "Not provided"}

Message:
${message}

---
Submitted from ${BRAND_NAME} website
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .field { margin-bottom: 15px; }
    .label { font-weight: bold; color: #555; }
    .message-box { background: #f9f9f9; padding: 15px; border-radius: 8px; border-left: 4px solid #007bff; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; color: #2c3e50;">${BRAND_NAME}</h1>
      <h2 style="margin: 10px 0 0 0; color: #007bff;">New Contact Form Submission</h2>
    </div>
    
    <div class="field">
      <div class="label">Name:</div>
      <div>${name || "Not provided"}</div>
    </div>
    
    <div class="field">
      <div class="label">Email:</div>
      <div><a href="mailto:${email}">${email}</a></div>
    </div>
    
    <div class="field">
      <div class="label">Phone:</div>
      <div>${phone || "Not provided"}</div>
    </div>
    
    <div class="field">
      <div class="label">Message:</div>
      <div class="message-box">${message.replace(/\n/g, "<br>")}</div>
    </div>
  </div>
</body>
</html>
  `.trim();

  await transport.sendMail({
    from,
    to: brandEmail,
    subject: `New Contact: ${name || "Anonymous"} - ${email}`,
    text,
    html,
  });
}
```

- [ ] **Step 2: Verify the function exists**

Run: `grep -n "sendContactEmail" app/_lib/mailer.ts`
Expected: Function definition found

- [ ] **Step 3: Commit**

```bash
git add app/_lib/mailer.ts
git commit -m "feat(mailer): add sendContactEmail function for contact form submissions"
```

---

## Task 3: Create Server Action for Contact Form

**Files:**
- Create: `app/contact/actions.ts`

- [ ] **Step 1: Create server action file**

Create `app/contact/actions.ts`:

```typescript
"use server";

import { sendContactEmail, type ContactSubmission } from "@/app/_lib/mailer";
import { z } from "zod";

const contactSchema = z.object({
  name: z.string().optional(),
  email: z.string().email("Please enter a valid email address"),
  phone: z.string().optional(),
  message: z.string().min(10, "Message must be at least 10 characters"),
});

export type ContactFormState = {
  success?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function submitContactForm(
  prevState: ContactFormState,
  formData: FormData
): Promise<ContactFormState> {
  try {
    const rawData: ContactSubmission = {
      name: formData.get("name") as string || "",
      email: formData.get("email") as string,
      phone: formData.get("phone") as string || "",
      message: formData.get("message") as string,
    };

    const validated = contactSchema.parse(rawData);

    await sendContactEmail({
      name: validated.name,
      email: validated.email,
      phone: validated.phone,
      message: validated.message,
    });

    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of error.issues) {
        const path = issue.path[0] as string;
        if (!fieldErrors[path]) {
          fieldErrors[path] = [];
        }
        fieldErrors[path].push(issue.message);
      }
      return { error: "Please fix the errors below", fieldErrors };
    }

    console.error("Contact form error:", error);
    return { error: "Failed to send message. Please try again later." };
  }
}
```

- [ ] **Step 2: Install zod if not present**

Run: `grep -q "zod" package.json && echo "installed" || npm install zod`

- [ ] **Step 3: Verify the file compiles**

Run: `npx tsc --noEmit app/contact/actions.ts 2>&1 | head -20`
Expected: No errors (or only about missing types which is fine)

- [ ] **Step 4: Commit**

```bash
git add app/contact/actions.ts package.json
git commit -m "feat(contact): add server action for form submission"
```

---

## Task 4: Create Contact Form Component

**Files:**
- Create: `app/contact/contact-form.tsx`

- [ ] **Step 1: Create the contact form component**

Create `app/contact/contact-form.tsx`:

```typescript
"use client";

import { useActionState } from "react";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { submitContactForm, type ContactFormState } from "./actions";
import { CheckCircle } from "lucide-react";

const initialState: ContactFormState = {};

export function ContactForm() {
  const [state, formAction, isPending] = useActionState(submitContactForm, initialState);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (state.success) {
      setShowSuccess(true);
    }
  }, [state.success]);

  if (showSuccess) {
    return (
      <div className="rounded-lg border bg-green-50 p-8 text-center dark:bg-green-900/20">
        <CheckCircle className="mx-auto mb-4 h-16 w-16 text-green-600" />
        <h3 className="text-xl font-semibold text-green-800 dark:text-green-200 mb-2">
          Message Sent Successfully!
        </h3>
        <p className="text-green-700 dark:text-green-300">
          Thanks for reaching out! We'll get back to you soon.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-8">
      <h2 className="text-xl font-semibold mb-6">Send us a message</h2>
      
      <form action={formAction} className="space-y-5">
        {state.error && !state.fieldErrors && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">
            {state.error}
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              type="text"
              placeholder="Your name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email <span className="text-red-500">*</span></Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="your@email.com"
              required
            />
            {state.fieldErrors?.email && (
              <p className="text-sm text-red-500">{state.fieldErrors.email[0]}</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Phone Number</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            placeholder="+94 XX XXX XXXX"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="message">Message <span className="text-red-500">*</span></Label>
          <Textarea
            id="message"
            name="message"
            placeholder="Tell us how we can help you..."
            rows={5}
            required
          />
          {state.fieldErrors?.message && (
            <p className="text-sm text-red-500">{state.fieldErrors.message[0]}</p>
          )}
        </div>

        <div className="flex items-center justify-between pt-2">
          <Button type="submit" disabled={isPending} size="lg">
            {isPending ? "Sending..." : "Send"}
          </Button>
          <p className="text-xs text-muted-foreground">
            reCAPTCHA protection (demo)
          </p>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Check if textarea exists or create it**

Run: `ls components/ui/ | grep -i textarea`
If not found, create `components/ui/textarea.tsx`:

```typescript
import * as React from "react"
import { cn } from "@/lib/utils"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
```

- [ ] **Step 3: Verify imports work**

Run: `npx tsc --noEmit app/contact/contact-form.tsx 2>&1 | head -20`
Expected: No errors related to our code

- [ ] **Step 4: Commit**

```bash
git add app/contact/contact-form.tsx components/ui/textarea.tsx
git commit -m "feat(contact): add contact form component with validation"
```

---

## Task 5: Redesign Contact Page

**Files:**
- Modify: `app/contact/page.tsx`

- [ ] **Step 1: Update the contact page with new layout**

Replace the content of `app/contact/page.tsx`:

```typescript
// app/contact/page.tsx
import { Phone, Mail, Clock } from "lucide-react";
import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { ContactForm } from "./contact-form";

export default function ContactPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="bg-gradient-to-b from-muted/50 to-background py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              We'd love to hear from you
            </h1>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              Our dedicated team is available to assist you with any inquiries. 
              Reach out to us through any of the channels below.
            </p>
          </div>
        </section>

        {/* Contact Info Cards */}
        <section className="py-12">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-8 md:grid-cols-3">
              {/* Phone */}
              <div className="rounded-lg border p-6 text-center hover:shadow-lg transition-shadow">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                  <Phone className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Call Us</h3>
                <p className="text-muted-foreground mb-3">Monday – Saturday</p>
                <a 
                  href="tel:+94740545536" 
                  className="text-base font-medium text-primary hover:underline"
                >
                  +94 74 054 5536
                </a>
              </div>

              {/* Email */}
              <div className="rounded-lg border p-6 text-center hover:shadow-lg transition-shadow">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
                  <Mail className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Email</h3>
                <p className="text-muted-foreground mb-3">For inquiries & support</p>
                <a 
                  href="mailto:dressingbear@gmail.com" 
                  className="text-base font-medium text-primary hover:underline"
                >
                  dressingbear@gmail.com
                </a>
              </div>

              {/* Hours */}
              <div className="rounded-lg border p-6 text-center hover:shadow-lg transition-shadow">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                  <Clock className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Business Hours</h3>
                <p className="text-muted-foreground mb-3">Sri Lanka Time</p>
                <p className="text-base font-medium">
                  Monday – Saturday<br />
                  <span className="text-muted-foreground">9:00 AM – 6:00 PM</span>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Contact Form */}
        <section className="pb-16">
          <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
            <ContactForm />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
```

- [ ] **Step 2: Verify the page renders**

Run: `npm run build 2>&1 | tail -30`
Expected: Build completes without errors on contact page

- [ ] **Step 3: Commit**

```bash
git add app/contact/page.tsx
git commit -m "feat(contact): redesign contact page with hero, info cards, and form"
```

---

## Task 6: Add Environment Variables to .env.local

**Files:**
- Modify: `.env.local`

- [ ] **Step 1: Document the required environment variables**

Add to the end of `.env.local`:

```bash
# Contact Form Email
BRAND_EMAIL=dressingbear@gmail.com
SMTP_FROM="Dressing Bear <no-reply@dressingbear.com>"
```

Note: The mailer already uses SMTP_HOST, SMTP_USER, SMTP_PASS for sending emails. Make sure these are configured in `.env.local`.

- [ ] **Step 2: Commit**

```bash
git add .env.local
git commit -m "docs(env): document contact email environment variables"
```

---

## Implementation Complete

After all tasks are completed:

1. Ensure SMTP credentials are configured in `.env.local`
2. Test the contact page at `/contact`
3. Submit the form and verify:
   - Success message appears
   - Email is sent to dressingbear@gmail.com

---

## Spec Coverage Check

| Spec Requirement | Task |
|-----------------|------|
| ✅ Add "Contact Us" to header | Task 1 |
| ✅ Hero section with welcoming text | Task 5 |
| ✅ 3 contact info cards (phone, email, hours) | Task 5 |
| ✅ Contact form with Name, Email, Phone, Message | Tasks 3, 4 |
| ✅ Success message on submission | Tasks 3, 4 |
| ✅ Email notification to business address | Tasks 2, 3 |