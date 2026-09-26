/**
 * eSewa Payment Controller
 * Handles eSewa payment initiation, verification and reconciliation.
 *
 * Trust model
 * -----------
 * The browser redirect that eSewa sends the customer back with is a hint, not
 * proof of payment. It is attacker-reachable (it is just a URL) and it never
 * arrives at all if the customer closes the tab after paying.
 *
 * So every state change here is driven by a server-to-server call to eSewa's
 * transaction status API, and every write is idempotent.
 */

const asyncHandler = require("express-async-handler");
const crypto = require("crypto");
const Order = require("../model/Order");
const Cart = require("../model/Cart");
const logger = require("../config/logger");

const isProd = process.env.NODE_ENV === "production";

/**
 * eSewa configuration.
 *
 * The test merchant credentials are public sample values. They are fine as a
 * development default but must never be silently used in production - a
 * misconfigured deploy would otherwise sign live payments with a key that is
 * printed in eSewa's public documentation.
 */
const ESEWA_CONFIG = {
  merchantId: process.env.ESEWA_MERCHANT_ID || (isProd ? null : "EPAYTEST"),
  secretKey: process.env.ESEWA_SECRET_KEY || (isProd ? null : "8gBm/:&EnhH.1/q"),
  paymentUrl: isProd
    ? "https://epay.esewa.com.np/api/epay/main/v2/form"
    : "https://rc-epay.esewa.com.np/api/epay/main/v2/form",
  statusUrl: isProd
    ? "https://epay.esewa.com.np/api/epay/transaction/status/"
    : "https://rc-epay.esewa.com.np/api/epay/transaction/status/",
};

if (isProd && (!ESEWA_CONFIG.merchantId || !ESEWA_CONFIG.secretKey)) {
  throw new Error(
    "ESEWA_MERCHANT_ID and ESEWA_SECRET_KEY must be set in production"
  );
}

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const BACKEND_URL =
  process.env.BACKEND_URL || "http://localhost:" + (process.env.PORT || 5000);

// Amounts cross a URL as decimal strings, so exact float equality is the wrong
// tool. One paisa of slack absorbs the formatting.
const AMOUNT_TOLERANCE = 0.01;

const STATUS_TIMEOUT_MS = 10000;

/** HMAC-SHA256, base64 - the signature format eSewa expects. */
const generateSignature = (message, secret) =>
  crypto.createHmac("sha256", secret).update(message).digest("base64");

/** Constant-time comparison, so we do not leak a signature via response timing. */
const signaturesMatch = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

const generateTransactionUuid = () =>
  "TXN-" + Date.now() + "-" + crypto.randomBytes(6).toString("hex");

/**
 * eSewa returns amounts with thousands separators, for example "1,100.0".
 * parseFloat("1,100.0") is 1, which silently failed the amount check on every
 * order of Rs 1,000 or more - after the customer had already paid.
 */
const parseAmount = (value) => {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return NaN;
  return parseFloat(value.replace(/,/g, ""));
};

const amountsMatch = (a, b) =>
  Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < AMOUNT_TOLERANCE;

/** Tamper-proof token binding a failure callback to one specific order. */
const failureToken = (orderId) =>
  crypto
    .createHmac("sha256", ESEWA_CONFIG.secretKey)
    .update("esewa-failure:" + orderId)
    .digest("hex");

const redirectToCheckout = (res, params) => {
  const query = new URLSearchParams(params).toString();
  return res.redirect(FRONTEND_URL + "/checkout?" + query);
};

/**
 * Ask eSewa directly what happened to a transaction. This - not the browser
 * redirect - is what we treat as the truth.
 *
 * Returns { ok: true, status, refId, totalAmount } or { ok: false, reason }.
 */
const fetchTransactionStatus = async (transactionUuid, totalAmount) => {
  const url =
    ESEWA_CONFIG.statusUrl +
    "?product_code=" +
    encodeURIComponent(ESEWA_CONFIG.merchantId) +
    "&total_amount=" +
    encodeURIComponent(totalAmount) +
    "&transaction_uuid=" +
    encodeURIComponent(transactionUuid);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    });

    if (!response.ok) {
      return { ok: false, reason: "eSewa responded " + response.status };
    }

    const body = await response.json();
    return {
      ok: true,
      status: body.status,
      refId: body.ref_id,
      totalAmount: parseAmount(body.total_amount),
    };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
};

/**
 * Settle an order against eSewa's authoritative status.
 * Safe to call repeatedly - every write is a conditional, atomic update.
 *
 * Returns one of: "paid" | "pending" | "failed" | "unverified"
 */
const settleOrder = async (order) => {
  if (order.paymentStatus === "paid") return "paid";

  const transactionUuid = order.esewa && order.esewa.transactionId;
  if (!transactionUuid) return "failed";

  const result = await fetchTransactionStatus(transactionUuid, order.total);

  // Could not reach eSewa. Leave the order alone: marking it failed here could
  // cancel an order the customer actually paid for.
  if (!result.ok) {
    logger.error(
      { transactionUuid, orderId: order._id, reason: result.reason },
      "eSewa status check failed"
    );
    return "unverified";
  }

  if (result.status === "COMPLETE") {
    if (!amountsMatch(result.totalAmount, order.total)) {
      logger.error(
        {
          transactionUuid,
          orderId: order._id,
          reportedAmount: result.totalAmount,
          expectedAmount: order.total,
        },
        "eSewa amount mismatch - refusing to settle"
      );
      return "failed";
    }

    const updated = await Order.markPaidOnce(order._id, {
      transactionId: transactionUuid,
      refId: result.refId,
      amount: result.totalAmount,
    });

    // updated === null means a concurrent request already settled this order.
    // Either way it is paid exactly once and the cart is cleared exactly once.
    if (updated) {
      await Cart.findOneAndUpdate(
        { user: order.user },
        { items: [], promoCode: null }
      );
    }

    return "paid";
  }

  if (result.status === "PENDING" || result.status === "AMBIGUOUS") {
    return "pending";
  }

  // CANCELED, NOT_FOUND, FULL_REFUND, PARTIAL_REFUND
  await Order.markPaymentFailed(order._id);
  return "failed";
};

// @desc    Initiate eSewa payment
// @route   POST /api/esewa/initiate
// @access  Private
const initiatePayment = asyncHandler(async (req, res) => {
  const { orderId } = req.body;

  if (!orderId) {
    res.status(400);
    throw new Error("Order ID is required");
  }

  const order = await Order.findById(orderId);

  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  if (order.user.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error("Not authorized to pay for this order");
  }

  if (order.paymentStatus === "paid") {
    res.status(400);
    throw new Error("This order has already been paid");
  }

  if (order.paymentMethod !== "esewa") {
    res.status(400);
    throw new Error("This order is not set for eSewa payment");
  }

  const transactionUuid = generateTransactionUuid();

  const amount = order.total;
  const taxAmount = 0;
  const productServiceCharge = 0;
  const productDeliveryCharge = 0;
  const totalAmount =
    amount + taxAmount + productServiceCharge + productDeliveryCharge;

  const signatureMessage =
    "total_amount=" +
    totalAmount +
    ",transaction_uuid=" +
    transactionUuid +
    ",product_code=" +
    ESEWA_CONFIG.merchantId;
  const signature = generateSignature(signatureMessage, ESEWA_CONFIG.secretKey);

  const successUrl = BACKEND_URL + "/api/esewa/verify";
  // The failure callback is unauthenticated (eSewa redirects the browser to
  // it), so the order id is accompanied by an HMAC we generated. Without it,
  // anyone could hit the endpoint with an arbitrary order id and mark a
  // stranger's order failed.
  const failureUrl =
    BACKEND_URL +
    "/api/esewa/failed?orderId=" +
    order._id +
    "&token=" +
    failureToken(order._id);

  order.esewa = { transactionId: transactionUuid };
  await order.save();

  res.status(200).json({
    success: true,
    message: "Payment initiated",
    data: {
      paymentUrl: ESEWA_CONFIG.paymentUrl,
      formData: {
        amount: amount.toString(),
        tax_amount: taxAmount.toString(),
        product_service_charge: productServiceCharge.toString(),
        product_delivery_charge: productDeliveryCharge.toString(),
        total_amount: totalAmount.toString(),
        transaction_uuid: transactionUuid,
        product_code: ESEWA_CONFIG.merchantId,
        signature: signature,
        signed_field_names: "total_amount,transaction_uuid,product_code",
        success_url: successUrl,
        failure_url: failureUrl,
      },
    },
  });
});

// @desc    Verify eSewa payment (success callback)
// @route   GET /api/esewa/verify
// @access  Public (eSewa redirects the customer's browser here)
const verifyPayment = asyncHandler(async (req, res) => {
  const { data } = req.query;

  const invalidResponse = () =>
    redirectToCheckout(res, {
      status: "error",
      message: "Invalid payment response",
    });

  if (!data) return invalidResponse();

  let decodedData;
  try {
    decodedData = JSON.parse(Buffer.from(data, "base64").toString("utf-8"));
  } catch (error) {
    return invalidResponse();
  }

  const transactionUuid = decodedData.transaction_uuid;
  const signedFieldNames = decodedData.signed_field_names;
  const signature = decodedData.signature;

  if (!transactionUuid || !signedFieldNames || !signature) {
    return invalidResponse();
  }

  // First gate: the payload really came from eSewa.
  const signatureMessage = signedFieldNames
    .split(",")
    .map((field) => field + "=" + decodedData[field])
    .join(",");
  const expectedSignature = generateSignature(
    signatureMessage,
    ESEWA_CONFIG.secretKey
  );

  if (!signaturesMatch(signature, expectedSignature)) {
    logger.warn(
      { transactionUuid },
      "eSewa signature verification failed - payload rejected"
    );
    return redirectToCheckout(res, {
      status: "error",
      message: "Payment verification failed",
    });
  }

  const order = await Order.findOne({
    "esewa.transactionId": transactionUuid,
  });

  if (!order) {
    logger.error({ transactionUuid }, "No order matches eSewa transaction");
    return redirectToCheckout(res, {
      status: "error",
      message: "Order not found",
    });
  }

  // Second gate, and the one that actually decides: ask eSewa directly.
  const outcome = await settleOrder(order);

  if (outcome === "paid") {
    return redirectToCheckout(res, {
      status: "success",
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
    });
  }

  if (outcome === "pending" || outcome === "unverified") {
    // Money may well have moved. Never tell the customer it failed - send them
    // to a page that polls /api/esewa/status/:orderId until eSewa settles.
    return redirectToCheckout(res, {
      status: "processing",
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      message: "We are confirming your payment. This can take a moment.",
    });
  }

  return redirectToCheckout(res, {
    status: "failed",
    orderId: order._id.toString(),
    message: "Payment was not completed",
  });
});

// @desc    Handle eSewa payment failure / cancellation
// @route   GET /api/esewa/failed
// @access  Public (eSewa redirects the customer's browser here)
const handleFailure = asyncHandler(async (req, res) => {
  const { orderId, token } = req.query;

  // Verify the callback is one we generated. Previously this endpoint accepted
  // any orderId from the query string, so anyone could mark any order failed.
  if (orderId && token && signaturesMatch(token, failureToken(orderId))) {
    const order = await Order.findById(orderId);

    if (order) {
      // Do not trust "failed" blindly either - the customer may have paid and
      // then hit a redirect error. Confirm with eSewa before writing.
      const outcome = await settleOrder(order);

      if (outcome === "paid") {
        return redirectToCheckout(res, {
          status: "success",
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
        });
      }
    }
  } else if (orderId) {
    logger.warn(
      { orderId },
      "Rejected eSewa failure callback with missing or invalid token"
    );
  }

  return redirectToCheckout(res, {
    status: "failed",
    message: "Payment was cancelled or failed",
  });
});

// @desc    Check payment status (also reconciles against eSewa)
// @route   GET /api/esewa/status/:orderId
// @access  Private
const checkPaymentStatus = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.orderId);

  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  if (
    order.user.toString() !== req.user._id.toString() &&
    req.user.role !== "admin"
  ) {
    res.status(403);
    throw new Error("Not authorized to check this order");
  }

  // Recovery path for the case where the redirect never happened, because the
  // customer paid and then closed the tab. Polling this endpoint settles it.
  if (order.paymentStatus === "pending" && order.paymentMethod === "esewa") {
    await settleOrder(order);
  }

  const fresh = await Order.findById(order._id);

  res.status(200).json({
    success: true,
    data: {
      orderId: fresh._id,
      orderNumber: fresh.orderNumber,
      paymentStatus: fresh.paymentStatus,
      paymentMethod: fresh.paymentMethod,
      esewa: fresh.esewa,
    },
  });
});

module.exports = {
  initiatePayment,
  verifyPayment,
  handleFailure,
  checkPaymentStatus,
  // exported so tests can exercise the money-handling helpers directly
  _internals: { parseAmount, amountsMatch, failureToken, settleOrder },
};
