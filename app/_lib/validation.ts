// app/_lib/validation.ts
import { z } from "zod";

export const PasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[a-zA-Z]/, "Password must contain a letter")
  .regex(/[0-9]/, "Password must contain a number");

export const SignupSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters"),
    email: z.string().trim().email("Enter a valid email"),
    password: PasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match",
  });

export const LoginSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Password required"),
});

export const ProfileSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  email: z.string().trim().email("Enter a valid email"),
});

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password required"),
    newPassword: PasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match",
  });

export const RequestResetSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
});

export const ResetPasswordSchema = z
  .object({
    token: z.string().min(1),
    newPassword: PasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match",
  });

export const AddressSchema = z.object({
  label: z.string().trim().min(1, "Label required"),
  line1: z.string().trim().min(1, "Address line 1 required"),
  line2: z.string().trim().optional().nullable(),
  city: z.string().trim().min(1, "City required"),
  region: z.string().trim().min(1, "State/Province required"),
  postalCode: z.string().trim().min(1, "Postal code required"),
  country: z.string().trim().length(2, "Country must be a 2-letter code"),
  isDefault: z.boolean().optional().default(false),
});

export type SignupInput = z.infer<typeof SignupSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type ProfileInput = z.infer<typeof ProfileSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
export type RequestResetInput = z.infer<typeof RequestResetSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
export type AddressInput = z.infer<typeof AddressSchema>;
