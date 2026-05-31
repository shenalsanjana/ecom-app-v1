import { Truck, RotateCcw, ShieldCheck, BadgeCheck } from "lucide-react";

type Benefit = { icon: typeof Truck; title: string; description: string };

const BENEFITS: Benefit[] = [
  {
    icon: Truck,
    title: "Free Shipping",
    description: "On all orders over Rs. 5,000 island-wide.",
  },
  {
    icon: RotateCcw,
    title: "Easy Returns",
    description: "7-day hassle-free returns and exchanges.",
  },
  {
    icon: ShieldCheck,
    title: "Secure Checkout",
    description: "Encrypted payments you can trust.",
  },
  {
    icon: BadgeCheck,
    title: "Authentic Products",
    description: "Genuine pieces, quality guaranteed.",
  },
];

export function TrustStrip() {
  return (
    <section className="border-b bg-muted/40">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <ul className="grid grid-cols-2 gap-8 lg:grid-cols-4">
          {BENEFITS.map(({ icon: Icon, title, description }) => (
            <li key={title} className="flex flex-col items-center text-center">
              <Icon className="size-8 text-primary" aria-hidden />
              <h3 className="font-heading mt-4 text-base font-semibold tracking-tight">
                {title}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
