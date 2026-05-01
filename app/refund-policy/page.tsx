import type { Metadata } from "next";
import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";

export const metadata: Metadata = {
  title: "Refund Policy - Shoply",
  description: "Our refund and return policy for Shoply purchases.",
};

export default function RefundPolicyPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
          <h1 className="mb-8 text-3xl font-bold tracking-tight">Refund Policy</h1>

          <div className="prose prose-zinc dark:prose-invert max-w-none space-y-6">
            <p className="text-muted-foreground">
              Last updated: May 1, 2026
            </p>

            <section aria-labelledby="returns-heading">
              <h2 id="returns-heading" className="text-xl font-semibold">Returns</h2>
              <p>
                We accept returns within <strong>14 days</strong> from the date of delivery.
                To be eligible for a return, your item must be unused and in the same condition
                that you received it. It must also be in the original packaging.
              </p>
              <p>
                To initiate a return, please contact our customer support team at{" "}
                <a href="mailto:support@shoply.com" className="text-primary hover:underline">
                  support@shoply.com
                </a>{" "}
                or call us at +1 (555) 123-4567. We will provide you with instructions on how
                to return your item.
              </p>
            </section>

            <section aria-labelledby="refunds-heading">
              <h2 id="refunds-heading" className="text-xl font-semibold">Refunds</h2>
              <p>
                Once we receive your returned item, we will notify you of the receipt and
                inspect the item. Upon approval, your refund will be processed, and a credit
                will automatically be applied to your original method of payment within{" "}
                <strong>5-7 business days</strong>.
              </p>
              <p>
                Please note that it may take some time for your bank or credit card company
                to process and post the refund. If you have not received your refund after
                7 business days, please contact your bank or credit card company.
              </p>
            </section>

            <section aria-labelledby="exchanges-heading">
              <h2 id="exchanges-heading" className="text-xl font-semibold">Exchanges</h2>
              <p>
                We offer exchanges within <strong>14 days</strong> from the date of delivery.
                If you need to exchange an item for a different size or color, please contact
                us at{" "}
                <a href="mailto:support@shoply.com" className="text-primary hover:underline">
                  support@shoply.com
                </a>{" "}
                to initiate the exchange process.
              </p>
              <p>
                Exchanges are subject to availability. If the item you want to exchange for
                is not available, we will process a refund and you can place a new order.
              </p>
            </section>

            <section aria-labelledby="non-returnable-heading">
              <h2 id="non-returnable-heading" className="text-xl font-semibold">Non-Returnable Items</h2>
              <p>The following items cannot be returned:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Gift cards</li>
                <li>Downloadable software products</li>
                <li>Personalized or custom-made items</li>
                <li>Perishable goods (such as food, flowers, or newspapers)</li>
                <li>Intimate apparel and swimwear</li>
                <li>Health and personal care items</li>
                <li>Items marked as &quot;final sale&quot; or &quot;non-returnable&quot;</li>
              </ul>
            </section>

            <section aria-labelledby="damaged-items-heading">
              <h2 id="damaged-items-heading" className="text-xl font-semibold">Damaged or Defective Items</h2>
              <p>
                If you receive a damaged or defective item, please contact us immediately
                at{" "}
                <a href="mailto:support@shoply.com" className="text-primary hover:underline">
                  support@shoply.com
                </a>{" "}
                with photos of the item and packaging. We will work with you to resolve the
                issue as quickly as possible.
              </p>
              <p>
                Depending on the situation, we may offer a full refund, a partial refund,
                or send a replacement item at no additional cost to you.
              </p>
            </section>

            <section aria-labelledby="return-shipping-heading">
              <h2 id="return-shipping-heading" className="text-xl font-semibold">Return Shipping</h2>
              <p>
                The cost of return shipping will be deducted from your refund unless the
                return is due to our error (damaged, defective, or incorrect item) or you
                are exchanging an item.
              </p>
              <p>
                For your protection, we recommend using a trackable shipping service when
                returning items. Shoply is not responsible for items lost or damaged during
                return shipping.
              </p>
            </section>

            <section aria-labelledby="contact-us-heading">
              <h2 id="contact-us-heading" className="text-xl font-semibold">Contact Us</h2>
              <p>
                If you have any questions about our refund and return policy, please contact us:
              </p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Email: <a href="mailto:support@shoply.com" className="text-primary hover:underline">support@shoply.com</a></li>
                <li>Phone: +1 (555) 123-4567</li>
                <li>Hours: Monday - Friday, 9 AM - 6 PM EST</li>
              </ul>
            </section>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}