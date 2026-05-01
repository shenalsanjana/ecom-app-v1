import type { Metadata } from "next";
import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";

export const metadata: Metadata = {
  title: "Terms and Conditions - Dressing Bear",
  description: "Terms and conditions for using the Dressing Bear website and services.",
};

export default function TermsAndConditionsPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
          <h1 className="mb-8 text-3xl font-bold tracking-tight">Terms and Conditions</h1>

          <div className="prose prose-zinc dark:prose-invert max-w-none space-y-6">
            <p className="text-muted-foreground">
              Last updated: May 1, 2026
            </p>

            <section aria-labelledby="use-of-website-heading">
              <h2 id="use-of-website-heading" className="text-xl font-semibold">Use of the Website</h2>
              <p>
                By accessing and using the Dressing Bear website, you agree to be bound by these Terms and Conditions.
                You may use our website only for lawful purposes and in accordance with these terms. You are
                responsible for maintaining the confidentiality of your account credentials and for all activities
                that occur under your account.
              </p>
              <p>
                You agree not to use the website in any way that violates applicable laws or regulations, infringes
                on the rights of others, or interferes with the normal operation of the website. We reserve the right
                to suspend or terminate your access to the website if you violate these terms.
              </p>
            </section>

            <section aria-labelledby="product-information-heading">
              <h2 id="product-information-heading" className="text-xl font-semibold">Product Information and Pricing</h2>
              <p>
                Dressing Bear strives to provide accurate product descriptions, images, and pricing information.
                However, we do not warrant that product descriptions, pricing, or other content on the website
                is accurate, complete, reliable, or error-free. If a product is listed at an incorrect price
                due to a typographical error, we reserve the right to cancel any orders placed for that product.
              </p>
              <p>
                All products are subject to availability. We reserve the right to limit quantities or discontinue
                products at any time. Product images are for illustrative purposes and may not exactly match the
                actual product you receive.
              </p>
            </section>

            <section aria-labelledby="orders-and-payments-heading">
              <h2 id="orders-and-payments-heading" className="text-xl font-semibold">Orders and Payments</h2>
              <p>
                When you place an order on Dressing Bear, you agree to provide accurate and complete information. By
                submitting an order, you are making an offer to purchase the products in your cart. We reserve
                the right to accept or reject your order at our discretion.
              </p>
              <p>
                Payment must be made in full at the time of order. We accept various payment methods including
                credit cards, debit cards, and PayHere integrated payments. All payments are processed securely
                through our payment partners. You represent that you are authorized to use the payment method
                you provide.
              </p>
              <p>
                We reserve the right to cancel or limit orders at our discretion, including orders that appear
                to be placed by dealers, resellers, or distributors.
              </p>
            </section>

            <section aria-labelledby="shipping-delivery-heading">
              <h2 id="shipping-delivery-heading" className="text-xl font-semibold">Shipping and Delivery</h2>
              <p>
                Shipping costs and estimated delivery times are calculated at checkout based on your location
                and the shipping method you select. Dressing Bear is not responsible for delays caused by events beyond
                our control, including natural disasters, customs delays, or carrier issues.
              </p>
              <p>
                Title and risk of loss for products pass to you upon delivery to the shipping carrier. We are
                not liable for lost, damaged, or delayed shipments once the product is delivered to the carrier.
                Please inspect your package upon delivery and contact us within 48 hours if there are any issues.
              </p>
            </section>

            <section aria-labelledby="returns-refunds-heading">
              <h2 id="returns-refunds-heading" className="text-xl font-semibold">Returns and Refunds</h2>
              <p>
                Our return and refund policy is governed by our separate Refund Policy, which is incorporated
                into these Terms and Conditions by reference. Please review our Refund Policy for complete
                information about our return process and eligibility requirements.
              </p>
              <p>
                To initiate a return, please contact our customer support team at{" "}
                <a href="mailto:dressingbear@gmail.com" className="text-primary hover:underline">
                  dressingbear@gmail.com
                </a>{" "}
                or call us at +94 740545536 or WhatsApp us.
              </p>
            </section>

            <section aria-labelledby="intellectual-property-heading">
              <h2 id="intellectual-property-heading" className="text-xl font-semibold">Intellectual Property</h2>
              <p>
                All content on the Dressing Bear website, including but not limited to text, graphics, logos, images,
                product descriptions, reviews, and software, is the property of Dressing Bear or its content suppliers
                and is protected by copyright, trademark, and other intellectual property laws.
              </p>
              <p>
                You may not reproduce, distribute, modify, create derivative works from, publicly display, or
                exploit any content from our website without our prior written consent. All trademarks, service
                marks, and trade names of Dressing Bear are proprietary to Dressing Bear.
              </p>
            </section>

            <section aria-labelledby="limitation-liability-heading">
              <h2 id="limitation-liability-heading" className="text-xl font-semibold">Limitation of Liability</h2>
              <p>
                To the fullest extent permitted by law, Dressing Bear and its affiliates, officers, directors, employees,
                and agents shall not be liable for any indirect, incidental, special, consequential, or punitive
                damages arising out of or related to your use of the website, products, or services.
              </p>
              <p>
                Our total liability for any claim arising from your use of the website or our services shall not
                exceed the amount you paid for the products that gave rise to the claim. This limitation applies
                regardless of the theory of liability, whether tort, contract, or otherwise.
              </p>
            </section>

            <section aria-labelledby="amendments-termination-heading">
              <h2 id="amendments-termination-heading" className="text-xl font-semibold">Amendments and Termination</h2>
              <p>
                Dressing Bear reserves the right to modify these Terms and Conditions at any time. Any changes will be
                effective immediately upon posting on this page with an updated &ldquo;Last updated&rdquo; date. Your continued
                use of the website after any changes constitutes your acceptance of the modified terms.
              </p>
              <p>
                We may terminate your access to the website or these terms at any time, without notice, if you
                breach any provision of these Terms and Conditions. Upon termination, all rights and licenses
                granted to you will immediately cease.
              </p>
            </section>

            <section aria-labelledby="contact-us-heading">
              <h2 id="contact-us-heading" className="text-xl font-semibold">Contact Us</h2>
              <p>
                If you have any questions about these Terms and Conditions, please contact us:
              </p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Email: <a href="mailto:dressingbear@gmail.com" className="text-primary hover:underline">dressingbear@gmail.com</a></li>
                <li>Phone: +94 740545536</li>
                <li>WhatsApp: <a href="https://wa.me/94740545536" className="text-primary hover:underline">Chat on WhatsApp</a></li>
                <li>Hours: Monday - Friday, 9 AM - 6 PM Sri Lanka Time</li>
              </ul>
            </section>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
