import type { Metadata } from "next";
import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";

export const metadata: Metadata = {
  title: "Privacy Policy - Dressing Bear",
  description: "Information about data collection, usage, and protection at Dressing Bear.",
};

export default function PrivacyPolicyPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
          <h1 className="mb-8 text-3xl font-bold tracking-tight">Privacy Policy</h1>

          <div className="prose prose-zinc dark:prose-invert max-w-none space-y-6">
            <p className="text-muted-foreground">
              Last updated: May 1, 2026
            </p>

            <section aria-labelledby="information-we-collect-heading">
              <h2 id="information-we-collect-heading" className="text-xl font-semibold">Information We Collect</h2>
              <p>
                Dressing Bear collects information you provide directly to us, such as when you create
                an account, place an order, subscribe to our newsletter, or contact us for support.
                This information includes your name, email address, phone number, shipping address,
                and payment information.
              </p>
              <p>
                We also automatically collect certain information when you visit our website,
                including your IP address, browser type, operating system, device identifiers,
                and browsing behavior through cookies and similar technologies.
              </p>
            </section>

            <section aria-labelledby="use-of-information-heading">
              <h2 id="use-of-information-heading" className="text-xl font-semibold">Use of Information</h2>
              <p>We use the information we collect to:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Process and fulfill your orders, including shipping and payment processing</li>
                <li>Send order confirmations, shipping updates, and customer support responses</li>
                <li>Send promotional communications if you have opted in to receive them</li>
                <li>Improve our website and services based on your browsing behavior</li>
                <li>Detect and prevent fraud and unauthorized access</li>
                <li>Comply with legal obligations</li>
              </ul>
            </section>

            <section aria-labelledby="information-sharing-heading">
              <h2 id="information-sharing-heading" className="text-xl font-semibold">Information Sharing</h2>
              <p>
                Dressing Bear does not sell or rent your personal information to third parties. We share
                your information only in the following circumstances:
              </p>
              <ul className="list-disc pl-6 space-y-1">
                <li><strong>Service Providers:</strong> We share information with trusted third-party
                  service providers who assist us in operating our website, processing payments,
                  fulfilling orders, and delivering products.</li>
                <li><strong>Legal Compliance:</strong> We may disclose information if required by law,
                  court order, or governmental regulation.</li>
                <li><strong>Business Transfers:</strong> In the event of a merger, acquisition, or
                  sale of assets, your information may be transferred as part of that transaction.</li>
              </ul>
            </section>

            <section aria-labelledby="data-security-heading">
              <h2 id="data-security-heading" className="text-xl font-semibold">Data Security</h2>
              <p>
                Dressing Bear implements appropriate technical and organizational measures to protect
                your personal information against unauthorized access, alteration, disclosure, or
                destruction. This includes SSL encryption for data transmission, secure servers,
                and regular security assessments.
              </p>
              <p>
                While we strive to protect your information, no method of transmission over the
                Internet or electronic storage is 100% secure. We cannot guarantee absolute
                security, but we are committed to maintaining appropriate safeguards.
              </p>
            </section>

            <section aria-labelledby="cookies-tracking-heading">
              <h2 id="cookies-tracking-heading" className="text-xl font-semibold">Cookies and Tracking Technologies</h2>
              <p>
                Dressing Bear uses cookies and similar tracking technologies to enhance your browsing
                experience, analyze site traffic, and personalize content. Cookies are small data
                files stored on your device that help us remember your preferences and cart items.
              </p>
              <p>
                You can control cookies through your browser settings. Disabling cookies may affect
                your ability to use certain features of our website, such as adding items to your
                cart and checking out.
              </p>
              <p>
                We also use third-party analytics services that collect information about your
                use of our website to help us improve our services.
              </p>
            </section>

            <section aria-labelledby="changes-to-privacy-policy-heading">
              <h2 id="changes-to-privacy-policy-heading" className="text-xl font-semibold">Changes to the Privacy Policy</h2>
              <p>
                Dressing Bear reserves the right to update this Privacy Policy from time to time. Any
                changes will be posted on this page with an updated &ldquo;Last updated&rdquo; date. We
                encourage you to review this Privacy Policy periodically.
              </p>
              <p>
                For significant changes, we will provide notice through email or a prominent notice
                on our website prior to the change taking effect.
              </p>
            </section>

            <section aria-labelledby="contact-us-heading">
              <h2 id="contact-us-heading" className="text-xl font-semibold">Contact Us</h2>
              <p>
                If you have any questions about this Privacy Policy or wish to exercise your rights
                regarding your personal information, please contact us:
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