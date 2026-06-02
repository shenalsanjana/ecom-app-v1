export type ProviderMode = "test" | "live";

function providerMode(value: string | undefined): ProviderMode {
  return value?.trim().toLowerCase() === "live" ? "live" : "test";
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

export function envFlag(name: string): boolean {
  return process.env[name] === "true";
}

export function isPaymentConfigError(error: unknown): boolean {
  return error instanceof Error && /^(KOKO|MINTPAY|PAYHERE)_/.test(error.message);
}

export function getKokoConfig() {
  const mode = providerMode(process.env.KOKO_MODE);
  return {
    mode,
    merchantId: requiredEnv("KOKO_MERCHANT_ID"),
    apiKey: requiredEnv("KOKO_API_KEY"),
    privateKey: requiredEnv("KOKO_PRIVATE_KEY").replace(/\\n/g, "\n"),
    publicKey: (process.env.KOKO_PUBLIC_KEY ?? "").replace(/\\n/g, "\n"),
    pluginName: process.env.KOKO_PLUGIN_NAME || "customapi",
    pluginVersion: process.env.KOKO_PLUGIN_VERSION || "1",
    orderCreateUrl:
      mode === "live"
        ? "https://prodapi.paykoko.com/api/merchants/orderCreate"
        : "https://qaapi.paykoko.com/api/merchants/orderCreate",
    orderViewUrl:
      mode === "live"
        ? "https://prodapi.paykoko.com/api/merchants/orderView"
        : "https://qaapi.paykoko.com/api/merchants/orderView",
  };
}

export function getMintpayConfig() {
  const mode = providerMode(process.env.MINTPAY_MODE);
  return {
    mode,
    merchantId: requiredEnv("MINTPAY_MERCHANT_ID"),
    merchantSecret: requiredEnv("MINTPAY_MERCHANT_SECRET"),
    apiUrl:
      mode === "live"
        ? "https://app.mintpay.lk/user-order/api/"
        : "https://dev.mintpay.lk/user-order/api/",
    loginUrl:
      mode === "live"
        ? "https://app.mintpay.lk/user-order/login/"
        : "https://dev.mintpay.lk/user-order/login/",
  };
}
