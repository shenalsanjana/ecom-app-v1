import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

async function subscribe(formData: FormData) {
  "use server";
  // No-op: real subscribe logic lands when the email backend exists.
  // The form is intentionally non-functional in this dummy version.
  void formData;
}

export function Newsletter() {
  return (
    <section className="border-b bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900">
      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Get 10% off your first order
        </h2>
        <p className="mt-3 text-base opacity-80">
          Join the newsletter for new arrivals, member-only sales, and styling tips.
        </p>
        <form action={subscribe} className="mx-auto mt-6 flex max-w-md gap-2">
          <Input
            type="email"
            name="email"
            required
            placeholder="you@example.com"
            className="bg-white text-zinc-900 placeholder:text-zinc-500 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-400"
          />
          <Button type="submit" variant="secondary">Subscribe</Button>
        </form>
      </div>
    </section>
  );
}
