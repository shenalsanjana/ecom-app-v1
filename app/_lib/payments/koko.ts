import { createPrivateKey, createPublicKey, sign, verify } from "crypto";
import { getKokoConfig } from "./config";
import type { PaymentProvider } from "./types";
import { requireNameAndEmail } from "./shared";

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function signKokoDataString(dataString: string, privateKeyPem: string): string {
  const key = createPrivateKey(privateKeyPem);
  return sign("RSA-SHA256", Buffer.from(dataString), key).toString("base64");
}

export const kokoProvider: PaymentProvider = {
  method: "KOKO",
  displayName: "Koko",
  async initiate(order, baseUrl) {
    const cfg = getKokoConfig();
    const buyer = requireNameAndEmail(order);
    const { firstName, lastName } = splitName(buyer.name);
    const amount = order.total.toFixed(2);
    const description =
      order.items.length > 0
        ? order.items.map((it) => `${it.name} x${it.quantity}`).join(", ")
        : "Dressing Bear Order";
    const reference = order.webNumber ?? order.id;
    const returnUrl = `${baseUrl}/api/payments/koko/return?order_id=${encodeURIComponent(order.id)}`;
    const cancelUrl = `${baseUrl}/api/payments/koko/return?order_id=${encodeURIComponent(order.id)}&status=cancelled`;
    const responseUrl = `${baseUrl}/api/payments/koko/response`;
    const dataString =
      cfg.merchantId +
      amount +
      "LKR" +
      cfg.pluginName +
      cfg.pluginVersion +
      returnUrl +
      cancelUrl +
      order.id +
      reference +
      firstName +
      lastName +
      buyer.email +
      description +
      cfg.apiKey +
      responseUrl;

    return {
      provider: "KOKO",
      displayName: "Koko",
      gatewayUrl: cfg.orderCreateUrl,
      fields: {
        _mId: cfg.merchantId,
        api_key: cfg.apiKey,
        _returnUrl: returnUrl,
        _responseUrl: responseUrl,
        _currency: "LKR",
        _amount: amount,
        _reference: reference,
        _pluginName: cfg.pluginName,
        _pluginVersion: cfg.pluginVersion,
        _cancelUrl: cancelUrl,
        _orderId: order.id,
        _firstName: firstName,
        _lastName: lastName,
        _email: buyer.email,
        _description: description,
        dataString,
        signature: signKokoDataString(dataString, cfg.privateKey),
        _mobileNo: order.customerPhone,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Order-view helpers (server-to-server status lookup)
// ---------------------------------------------------------------------------

export function signKokoOrderViewString(args: {
  merchantId: string;
  pluginName: string;
  pluginVersion: string;
  orderId: string;
  apiKey: string;
  privateKey: string;
}): string {
  return signKokoDataString(
    args.merchantId + args.pluginName + args.pluginVersion + args.orderId + args.apiKey,
    args.privateKey,
  );
}

// Defense-in-depth (Amendment A3): the orderView response carries a signature
// over `${orderId}${trnId}${status}` signed with Koko's private key, validated
// with Koko's public key (RSA-SHA256). The trust anchor for finalization is the
// server-to-server orderView call itself; this check only adds tamper-evidence.
// Verify ONLY when a public key and signature are present, and NEVER fail closed:
// on mismatch we log and still honor the server-reported status.
function verifyKokoResponseSignature(
  orderId: string,
  trnId: string,
  status: string,
  signatureB64: string,
  publicKeyPem: string,
): boolean {
  try {
    return verify(
      "RSA-SHA256",
      Buffer.from(`${orderId}${trnId}${status}`),
      createPublicKey(publicKeyPem),
      Buffer.from(signatureB64, "base64"),
    );
  } catch {
    return false;
  }
}

type KokoStatus = "PENDING" | "SUCCESS" | "FAILED";

// Diagnostic breadcrumb for the PENDING paths. `fetchKokoOrderStatus` deliberately
// never throws — every failure degrades to PENDING so a transient Koko outage can
// never mark a real payment as failed. The cost is that six very different faults
// (missing config, network error, non-2xx, non-JSON body, absent status key,
// unrecognized status token) all look identical from the database side: the order
// simply sits at "awaiting payment" forever. This logs WHICH one happened.
// Never logs credentials, signatures, or customer data — only shapes and tokens.
function logKokoPending(reason: string, detail: Record<string, unknown>) {
  console.warn("[koko] orderView -> PENDING", { reason, ...detail });
}

export async function fetchKokoOrderStatus(orderId: string): Promise<KokoStatus> {
  let cfg: ReturnType<typeof getKokoConfig>;
  try {
    cfg = getKokoConfig();
  } catch (err) {
    // Distinguished from a network failure: this is a deployment/config fault and
    // would silently strand 100% of Koko orders at "awaiting payment".
    logKokoPending("config-error", {
      orderId,
      message: err instanceof Error ? err.message : String(err),
    });
    return "PENDING";
  }

  try {
    const body = new URLSearchParams({
      _mId: cfg.merchantId,
      _pluginName: cfg.pluginName,
      _pluginVersion: cfg.pluginVersion,
      api_key: cfg.apiKey,
      _orderId: orderId,
      signature: signKokoOrderViewString({
        merchantId: cfg.merchantId,
        pluginName: cfg.pluginName,
        pluginVersion: cfg.pluginVersion,
        orderId,
        apiKey: cfg.apiKey,
        privateKey: cfg.privateKey,
      }),
    });

    let response: Response;
    try {
      response = await fetch(cfg.orderViewUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
    } catch (err) {
      logKokoPending("network-error", {
        orderId,
        url: cfg.orderViewUrl,
        message: err instanceof Error ? err.message : String(err),
      });
      return "PENDING";
    }

    // Read as text first: a non-JSON error page (HTML/plain) would otherwise make
    // response.json() throw and hide the actual Koko error message.
    const raw = await response.text();

    if (!response.ok) {
      logKokoPending("http-not-ok", {
        orderId,
        url: cfg.orderViewUrl,
        httpStatus: response.status,
        body: raw.slice(0, 500),
      });
      return "PENDING";
    }

    let json: {
      orderId?: string;
      trnId?: string;
      status?: string;
      signature?: string;
      data?: { orderId?: string; trnId?: string; status?: string; signature?: string };
    };
    try {
      json = JSON.parse(raw);
    } catch {
      logKokoPending("non-json-body", {
        orderId,
        url: cfg.orderViewUrl,
        contentType: response.headers.get("content-type"),
        body: raw.slice(0, 500),
      });
      return "PENDING";
    }

    const payload = json.data ?? json;
    const rawStatus = payload.status;
    const status = (rawStatus ?? "PENDING") as string;

    // A3: verify-when-present, never fail-closed.
    if (cfg.publicKey && payload.signature) {
      const ok = verifyKokoResponseSignature(
        payload.orderId ?? orderId,
        payload.trnId ?? "",
        status,
        payload.signature,
        cfg.publicKey,
      );
      if (!ok) {
        console.warn("[koko] orderView response signature mismatch — honoring server status anyway", { orderId });
      }
    }

    if (status === "SUCCESS" || status === "FAILED") return status;

    // Everything below stays PENDING. Record enough of the envelope SHAPE to tell
    // "Koko really says pending" apart from "we are reading the wrong field".
    // SG-1/SG-2 in docs/superpowers/plans/2026-05-28-koko-mintpay-payment-integration.md
    // were never closed against a real successful payment, so the field that
    // actually carries the payment status is still unconfirmed.
    logKokoPending(rawStatus === undefined ? "status-field-absent" : "status-not-terminal", {
      orderId,
      url: cfg.orderViewUrl,
      payloadSource: json.data ? "json.data" : "json (flat)",
      topLevelKeys: Object.keys(json),
      payloadKeys: Object.keys(payload ?? {}),
      rawStatus,
      body: raw.slice(0, 500),
    });
    return "PENDING";
  } catch (err) {
    logKokoPending("unexpected-error", {
      orderId,
      message: err instanceof Error ? err.message : String(err),
    });
    return "PENDING";
  }
}
