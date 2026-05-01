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