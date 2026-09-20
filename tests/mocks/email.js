/**
 * Test double for config/email.
 *
 * Wired in through moduleNameMapper in jest.config.js, so no test needs to
 * call jest.mock for it. Records every "sent" message so tests can assert on
 * the outcome - most usefully, that a password reset for an unknown address
 * sends nothing at all.
 */

const sentEmails = [];

const sendPasswordResetEmail = jest.fn(async (email, resetCode) => {
  sentEmails.push({ type: 'passwordReset', email, resetCode });
});

const __getSentEmails = () => sentEmails;
const __clearSentEmails = () => {
  sentEmails.length = 0;
};

module.exports = {
  sendPasswordResetEmail,
  __getSentEmails,
  __clearSentEmails,
};
