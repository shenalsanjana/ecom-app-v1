// One-off SMTP diagnostic. Loads .env.local, runs transport.verify(), then
// attempts a real send to BRAND_EMAIL. Reports the exact nodemailer error
// object on failure (code, command, response, responseCode) so we can
// reason about *why* delivery is failing.
import { existsSync } from "node:fs";
for (const file of [".env", ".env.local"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}
import nodemailer from "nodemailer";

function mask(v: string | undefined): string {
  if (!v) return "(unset)";
  if (v.length <= 8) return "***";
  return `${v.slice(0, 4)}…${v.slice(-4)} (len=${v.length})`;
}

async function main() {
  console.log("=== env (sensitive values masked) ===");
  console.log("SMTP_HOST:", process.env.SMTP_HOST ?? "(unset)");
  console.log("SMTP_PORT:", process.env.SMTP_PORT ?? "(unset)");
  console.log("SMTP_USER:", process.env.SMTP_USER ?? "(unset)");
  console.log("SMTP_PASS:", mask(process.env.SMTP_PASS));
  console.log("SMTP_FROM:", process.env.SMTP_FROM ?? "(unset)");
  console.log("BRAND_EMAIL:", process.env.BRAND_EMAIL ?? "(unset)");
  console.log();

  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? "587"),
    secure: false, // STARTTLS on 587
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    logger: true,
    debug: true,
  });

  console.log("=== nodemailer transport.verify() ===");
  try {
    await transport.verify();
    console.log("verify(): OK — SMTP connection + AUTH succeeded");
  } catch (err) {
    const e = err as Record<string, unknown>;
    console.error("verify() FAILED with:");
    console.error("  code:", e.code);
    console.error("  command:", e.command);
    console.error("  responseCode:", e.responseCode);
    console.error("  response:", e.response);
    console.error("  message:", e.message);
    process.exit(1);
  }

  console.log();
  console.log("=== attempting real send ===");
  try {
    const info = await transport.sendMail({
      from: process.env.SMTP_FROM ?? "",
      to: process.env.BRAND_EMAIL ?? "",
      subject: "SMTP diagnostic — " + new Date().toISOString(),
      text: "If you see this, SMTP delivery to BRAND_EMAIL is working.",
    });
    console.log("send: OK");
    console.log("  messageId:", info.messageId);
    console.log("  accepted:", info.accepted);
    console.log("  rejected:", info.rejected);
    console.log("  response:", info.response);
  } catch (err) {
    const e = err as Record<string, unknown>;
    console.error("send() FAILED with:");
    console.error("  code:", e.code);
    console.error("  command:", e.command);
    console.error("  responseCode:", e.responseCode);
    console.error("  response:", e.response);
    console.error("  message:", e.message);
    process.exit(2);
  }
}

main().catch((e) => {
  console.error("unexpected:", e);
  process.exit(99);
});
