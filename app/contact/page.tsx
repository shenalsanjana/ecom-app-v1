// app/contact/page.tsx
import Link from "next/link";
import { ArrowLeft, Phone, Mail, Clock } from "lucide-react";
import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { ContactForm } from "./contact-form";

export const dynamic = "force-static";

export default function ContactPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="bg-gradient-to-b from-muted/50 to-background py-12 sm:py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6">
              <ArrowLeft className="h-4 w-4" />
              Back to home
            </Link>
            <div className="text-center">
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
                We&apos;d love to hear from you
              </h1>
              <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
                Our dedicated team is available to assist you with any inquiries.
                Reach out to us through any of the channels below.
              </p>
            </div>
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