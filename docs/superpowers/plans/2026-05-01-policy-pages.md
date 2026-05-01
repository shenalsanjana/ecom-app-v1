# Policy Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three legal policy pages (Refund, Privacy, Terms) for PayHere compliance, integrate into footer and cart summary.

**Architecture:** Three standalone pages with consistent layout, styled prose content. Footer gets new Legal column. Cart summary gets policy links above checkout button.

**Tech Stack:** Next.js App Router, Tailwind CSS, existing UI components (Button, Separator)

---

### Task 1: Refund Policy Page

**Files:**
- Create: `app/refund-policy/page.tsx`

- [ ] **Step 1: Create refund-policy page**

```tsx
// app/refund-policy/page.tsx
import Link from "next/link";
import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";

export const metadata = {
  title: "Refund Policy - Shoply",
  description: "Our refund and return policy for Shoply purchases.",
};

export default function RefundPolicyPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
          <h1 className="mb-8 text-2xl font-semibold tracking-tight">Refund Policy</h1>
          <div className="prose prose-zinc dark:prose-invert max-w-none space-y-4 text-sm">
            <p>Thank you for shopping at Shoply. We value your satisfaction and strive to provide you with the best online shopping experience possible. If, for any reason, you are not completely satisfied with your purchase, we are here to help.</p>

            <h2 className="text-lg font-semibold mt-6">Returns</h2>
            <p>We accept returns within 14 days from the date of purchase. To be eligible for a return, your item must be unused and in the same condition that you received it. It must also be in the original packaging.</p>

            <h2 className="text-lg font-semibold mt-6">Refunds</h2>
            <p>Once we receive your return and inspect the item, we will notify you of the status of your refund. If your return is approved, we will initiate a refund to your original method of payment. Please note that the refund amount will exclude any shipping charges incurred during the initial purchase. Refunds will be processed within 5-7 business days.</p>

            <h2 className="text-lg font-semibold mt-6">Exchanges</h2>
            <p>If you would like to exchange your item for a different size, color, or style, please contact our customer support team within 14 days of receiving your order. We will provide you with further instructions on how to proceed with the exchange.</p>

            <h2 className="text-lg font-semibold mt-6">Non-Returnable Items</h2>
            <p>Certain items are non-returnable and non-refundable. These include:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Gift cards</li>
              <li>Downloadable software products</li>
              <li>Personalized or custom-made items</li>
              <li>Perishable goods</li>
            </ul>

            <h2 className="text-lg font-semibold mt-6">Damaged or Defective Items</h2>
            <p>In the unfortunate event that your item arrives damaged or defective, please contact us immediately. We will arrange for a replacement or issue a refund, depending on your preference and product availability.</p>

            <h2 className="text-lg font-semibold mt-6">Return Shipping</h2>
            <p>You will be responsible for paying the shipping costs for returning your item unless the return is due to our error (e.g., wrong item shipped, defective product). In such cases, we will provide you with a prepaid shipping label.</p>

            <h2 className="text-lg font-semibold mt-6">Contact Us</h2>
            <p>If you have any questions or concerns regarding our refund policy, please contact our customer support team. We are here to assist you and ensure your shopping experience with us is enjoyable and hassle-free.</p>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: All routes compile including `/refund-policy`

- [ ] **Step 3: Commit**

```bash
git add app/refund-policy/page.tsx
git commit -m "feat(policies): add refund policy page"
```

---

### Task 2: Privacy Policy Page

**Files:**
- Create: `app/privacy-policy/page.tsx`

- [ ] **Step 1: Create privacy-policy page**

```tsx
// app/privacy-policy/page.tsx
import Link from "next/link";
import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";

export const metadata = {
  title: "Privacy Policy - Shoply",
  description: "How Shoply collects, uses, and protects your personal information.",
};

export default function PrivacyPolicyPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
          <h1 className="mb-8 text-2xl font-semibold tracking-tight">Privacy Policy</h1>
          <div className="prose prose-zinc dark:prose-invert max-w-none space-y-4 text-sm">
            <p>At Shoply, we are committed to protecting the privacy and security of our customers' personal information. This Privacy Policy outlines how we collect, use, and safeguard your information when you visit or make a purchase on our website. By using our website, you consent to the practices described in this policy.</p>

            <h2 className="text-lg font-semibold mt-6">Information We Collect</h2>
            <p>When you visit our website, we may collect certain information about you, including:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Personal identification information (such as your name, email address, and phone number) provided voluntarily by you during the registration or checkout process.</li>
              <li>Payment and billing information necessary to process your orders, including credit card details, which are securely handled by trusted third-party payment processors.</li>
              <li>Browsing information, such as your IP address, browser type, and device information, collected automatically using cookies and similar technologies.</li>
            </ul>

            <h2 className="text-lg font-semibold mt-6">Use of Information</h2>
            <p>We may use the collected information for the following purposes:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>To process and fulfill your orders, including shipping and delivery.</li>
              <li>To communicate with you regarding your purchases, provide customer support, and respond to inquiries or requests.</li>
              <li>To personalize your shopping experience and present relevant product recommendations and promotions.</li>
              <li>To improve our website, products, and services based on your feedback and browsing patterns.</li>
              <li>To detect and prevent fraud, unauthorized activities, and abuse of our website.</li>
            </ul>

            <h2 className="text-lg font-semibold mt-6">Information Sharing</h2>
            <p>We respect your privacy and do not sell, trade, or otherwise transfer your personal information to third parties without your consent, except in the following circumstances:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Trusted service providers:</strong> We may share your information with third-party service providers who assist us in operating our website, processing payments, and delivering products. These providers are contractually obligated to handle your data securely and confidentially.</li>
              <li><strong>Legal requirements:</strong> We may disclose your information if required to do so by law or in response to valid legal requests or orders.</li>
            </ul>

            <h2 className="text-lg font-semibold mt-6">Data Security</h2>
            <p>We implement industry-standard security measures to protect your personal information from unauthorized access, alteration, disclosure, or destruction. However, please be aware that no method of transmission over the internet or electronic storage is 100% secure, and we cannot guarantee absolute security.</p>

            <h2 className="text-lg font-semibold mt-6">Cookies and Tracking Technologies</h2>
            <p>We use cookies and similar technologies to enhance your browsing experience, analyze website traffic, and gather information about your preferences and interactions with our website. You have the option to disable cookies through your browser settings, but this may limit certain features and functionality of our website.</p>

            <h2 className="text-lg font-semibold mt-6">Changes to the Privacy Policy</h2>
            <p>We reserve the right to update or modify this Privacy Policy at any time. Any changes will be posted on this page with a revised "last updated" date. We encourage you to review this Privacy Policy periodically to stay informed about how we collect, use, and protect your information.</p>

            <h2 className="text-lg font-semibold mt-6">Contact Us</h2>
            <p>If you have any questions, concerns, or requests regarding our Privacy Policy or the handling of your personal information, please contact us using the information provided on our website.</p>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: All routes compile including `/privacy-policy`

- [ ] **Step 3: Commit**

```bash
git add app/privacy-policy/page.tsx
git commit -m "feat(policies): add privacy policy page"
```

---

### Task 3: Terms and Conditions Page

**Files:**
- Create: `app/terms-and-conditions/page.tsx`

- [ ] **Step 1: Create terms-and-conditions page**

```tsx
// app/terms-and-conditions/page.tsx
import Link from "next/link";
import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";

export const metadata = {
  title: "Terms and Conditions - Shoply",
  description: "Terms and conditions governing your use of the Shoply website and purchases.",
};

export default function TermsAndConditionsPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
          <h1 className="mb-8 text-2xl font-semibold tracking-tight">Terms and Conditions</h1>
          <div className="prose prose-zinc dark:prose-invert max-w-none space-y-4 text-sm">
            <p>Welcome to Shoply. These Terms and Conditions govern your use of our website and the purchase and sale of products from our platform. By accessing and using our website, you agree to comply with these terms. Please read them carefully before proceeding with any transactions.</p>

            <h2 className="text-lg font-semibold mt-6">Use of the Website</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>You must be at least 18 years old to use our website or make purchases.</li>
              <li>You are responsible for maintaining the confidentiality of your account information, including your username and password.</li>
              <li>You agree to provide accurate and current information during the registration and checkout process.</li>
              <li>You may not use our website for any unlawful or unauthorized purposes.</li>
            </ul>

            <h2 className="text-lg font-semibold mt-6">Product Information and Pricing</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>We strive to provide accurate product descriptions, images, and pricing information. However, we do not guarantee the accuracy or completeness of such information.</li>
              <li>Prices are subject to change without notice. Any promotions or discounts are valid for a limited time and may be subject to additional terms and conditions.</li>
            </ul>

            <h2 className="text-lg font-semibold mt-6">Orders and Payments</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>By placing an order on our website, you are making an offer to purchase the selected products.</li>
              <li>We reserve the right to refuse or cancel any order for any reason, including but not limited to product availability, errors in pricing or product information, or suspected fraudulent activity.</li>
              <li>You agree to provide valid and up-to-date payment information and authorize us to charge the total order amount, including applicable taxes and shipping fees, to your chosen payment method.</li>
              <li>We use trusted third-party payment processors to handle your payment information securely. We do not store or have access to your full payment details.</li>
            </ul>

            <h2 className="text-lg font-semibold mt-6">Shipping and Delivery</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>We will make reasonable efforts to ensure timely shipping and delivery of your orders.</li>
              <li>Shipping and delivery times provided are estimates and may vary based on your location and other factors.</li>
            </ul>

            <h2 className="text-lg font-semibold mt-6">Returns and Refunds</h2>
            <p>Our Returns and Refund Policy governs the process and conditions for returning products and seeking refunds. Please refer to the policy provided on our website for more information.</p>

            <h2 className="text-lg font-semibold mt-6">Intellectual Property</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>All content and materials on our website, including but not limited to text, images, logos, and graphics, are protected by intellectual property rights and are the property of Shoply or its licensors.</li>
              <li>You may not use, reproduce, distribute, or modify any content from our website without our prior written consent.</li>
            </ul>

            <h2 className="text-lg font-semibold mt-6">Limitation of Liability</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>In no event shall Shoply, its directors, employees, or affiliates be liable for any direct, indirect, incidental, special, or consequential damages arising out of or in connection with your use of our website or the purchase and use of our products.</li>
              <li>We make no warranties or representations, express or implied, regarding the quality, accuracy, or suitability of the products offered on our website.</li>
            </ul>

            <h2 className="text-lg font-semibold mt-6">Amendments and Termination</h2>
            <p>We reserve the right to modify, update, or terminate these Terms and Conditions at any time without prior notice. It is your responsibility to review these terms periodically for any changes.</p>

            <h2 className="text-lg font-semibold mt-6">Contact Us</h2>
            <p>If you have any questions regarding these Terms and Conditions, please contact us using the information provided on our website.</p>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: All routes compile including `/terms-and-conditions`

- [ ] **Step 3: Commit**

```bash
git add app/terms-and-conditions/page.tsx
git commit -m "feat(policies): add terms and conditions page"
```

---

### Task 4: Add Legal Section to SiteFooter

**Files:**
- Modify: `app/_components/home/site-footer.tsx:14-18` (add Legal column)

- [ ] **Step 1: Add Legal column to footer**

In COLUMNS array, add new column before Social:

```tsx
{
  heading: "Legal",
  links: ["Refund Policy", "Privacy Policy", "Terms & Conditions"],
},
```

Change each link to use `<Link href="/route">` instead of just text. Since the COLUMNS currently has plain strings, I need to change the structure. Let me check the current file and make the proper edit.

Read `app/_components/home/site-footer.tsx` and modify to add Legal column with proper Link components.

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: Footer renders Legal section with links

- [ ] **Step 3: Commit**

```bash
git add app/_components/home/site-footer.tsx
git commit -m "feat(policies): add legal links to footer"
```

---

### Task 5: Add Policy Links to CartSummary

**Files:**
- Modify: `app/_components/cart/cart-summary.tsx:57-63` (add policy links above checkout button)

- [ ] **Step 1: Add policy links before checkout button**

After the Separator at line 50, add links above the checkout Button:

```tsx
<div className="mt-4 flex gap-4 text-xs text-muted-foreground justify-center">
  <Link href="/refund-policy" className="hover:text-foreground underline underline-offset-2">Refund Policy</Link>
  <Link href="/privacy-policy" className="hover:text-foreground underline underline-offset-2">Privacy Policy</Link>
  <Link href="/terms-and-conditions" className="hover:text-foreground underline underline-offset-2">Terms & Conditions</Link>
</div>
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: Cart page shows policy links above checkout

- [ ] **Step 3: Commit**

```bash
git add app/_components/cart/cart-summary.tsx
git commit -m "feat(policies): add policy links to cart summary"
```

---

## Verification

After all tasks:
- [ ] `/refund-policy` renders correctly
- [ ] `/privacy-policy` renders correctly
- [ ] `/terms-and-conditions` renders correctly
- [ ] Footer shows Legal section with all three links
- [ ] Cart summary shows policy links above checkout button
- [ ] Build passes with all new routes