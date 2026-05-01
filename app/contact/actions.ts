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
