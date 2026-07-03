import { describe, it, expect, beforeEach } from "vitest";
import { sendOtpSms, sendAccountExistsSms, __setTestSmsSender } from "../sms";

let captured: { to: string; message: string }[];
beforeEach(() => {
  captured = [];
  __setTestSmsSender(async (to, message) => { captured.push({ to, message }); });
});

describe("sendOtpSms", () => {
  it("strips the + and includes the code", async () => {
    await sendOtpSms("+94771234567", "123456", "SIGNUP");
    expect(captured[0].to).toBe("94771234567");
    expect(captured[0].message).toContain("123456");
  });
});

describe("sendAccountExistsSms", () => {
  it("sends a no-code 'already have an account' notice", async () => {
    await sendAccountExistsSms("+94771234567");
    expect(captured[0].to).toBe("94771234567");
    expect(captured[0].message).toMatch(/already have/i);
    expect(captured[0].message).not.toMatch(/\d{6}/);
  });
});

describe("without a test sender", () => {
  it("throws when Notify.lk env is missing", async () => {
    __setTestSmsSender(null);
    delete process.env.NOTIFY_LK_USER_ID;
    delete process.env.NOTIFY_LK_API_KEY;
    delete process.env.NOTIFY_LK_SENDER_ID;
    await expect(sendOtpSms("+94771234567", "123456", "SIGNUP")).rejects.toThrow(/Notify\.lk is not configured/);
  });
});
