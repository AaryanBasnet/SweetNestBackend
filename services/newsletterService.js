/**
 * Newsletter Service
 *
 * Signs email addresses up to a Brevo contact list. We keep no subscriber
 * table of our own: Brevo owns the list, the unsubscribe links and the
 * consent records, which is exactly the part that is easy to get wrong.
 *
 * Two modes, picked by configuration:
 *  - Double opt-in (BREVO_DOI_TEMPLATE_ID and BREVO_DOI_REDIRECT_URL set):
 *    Brevo emails a confirmation link and only adds the contact once it is
 *    clicked. Recommended - it proves the address belongs to the person.
 *  - Direct: the contact is added to the list straight away.
 */

const { AppError } = require("../utils/AppError");
const logger = require("../config/logger");

const BREVO_API = "https://api.brevo.com/v3";
const REQUEST_TIMEOUT_MS = 8000;

/** Read on each call, so tests and config reloads see current values. */
const getConfig = () => ({
  apiKey: process.env.BREVO_API_KEY,
  listId: Number(process.env.BREVO_LIST_ID),
  doiTemplateId: Number(process.env.BREVO_DOI_TEMPLATE_ID),
  doiRedirectUrl: process.env.BREVO_DOI_REDIRECT_URL,
});

/**
 * Subscribe an email address.
 * @returns {Promise<{ status: "subscribed" | "pending_confirmation" }>}
 */
const subscribe = async (email) => {
  const { apiKey, listId, doiTemplateId, doiRedirectUrl } = getConfig();

  if (!apiKey || !listId) {
    // A deploy without the keys should fail loudly in the logs, but the
    // visitor only needs to know it did not work.
    throw new AppError("Newsletter sign-up is not available right now.", 503);
  }

  const doubleOptIn = Boolean(doiTemplateId && doiRedirectUrl);
  const [path, payload] = doubleOptIn
    ? [
        "/contacts/doubleOptinConfirmation",
        {
          email,
          includeListIds: [listId],
          templateId: doiTemplateId,
          redirectionUrl: doiRedirectUrl,
        },
      ]
    : ["/contacts", { email, listIds: [listId], updateEnabled: true }];

  let response;
  try {
    response = await fetch(`${BREVO_API}${path}`, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    logger.error({ err: error }, "Brevo request failed");
    throw new AppError("Could not reach our newsletter service. Please try again.", 502);
  }

  // 201 created, 204 updated (an existing contact was added to the list).
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    // The address is personal data, so it stays out of the logs.
    logger.error(
      { status: response.status, code: body.code, reason: body.message },
      "Brevo rejected newsletter sign-up"
    );
    throw new AppError("Could not sign you up right now. Please try again later.", 502);
  }

  return { status: doubleOptIn ? "pending_confirmation" : "subscribed" };
};

module.exports = { subscribe };
