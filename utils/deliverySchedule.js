/**
 * Delivery schedule rules.
 *
 * The bakery works in Nepal time, and a cake needs notice, so a delivery has
 * to be booked far enough ahead and not absurdly far. These rules used to
 * exist only as a hint in the checkout form, which meant anyone calling the API
 * directly could book a delivery for yesterday.
 *
 * A booking is a calendar day plus a time slot. The client sends the day as an
 * instant (around midday UTC), and the day is read back in Nepal time, so it
 * does not matter which time zone the customer's browser is in.
 */

const TIME_SLOTS = ['09:00 AM - 12:00 PM', '12:00 PM - 03:00 PM', '03:00 PM - 06:00 PM'];

const MIN_NOTICE_HOURS = 24;
const MAX_DAYS_AHEAD = 90;

// Nepal Standard Time is UTC+5:45 all year (no daylight saving)
const NEPAL_OFFSET_MS = (5 * 60 + 45) * 60 * 1000;

/** The hour a slot starts, in 24-hour time. "03:00 PM - ..." is 15. */
const slotStartHour = (slot) => {
  const [time, meridiem] = slot.split(' - ')[0].split(' ');
  const hour = Number(time.split(':')[0]) % 12;
  return meridiem === 'PM' ? hour + 12 : hour;
};

/** The instant a booking starts: that Nepal-time day, at the slot's start hour. */
const slotStartInstant = (date, slot) => {
  const nepal = new Date(new Date(date).getTime() + NEPAL_OFFSET_MS);
  return new Date(
    Date.UTC(nepal.getUTCFullYear(), nepal.getUTCMonth(), nepal.getUTCDate(), slotStartHour(slot)) -
      NEPAL_OFFSET_MS
  );
};

/**
 * Check a booking against the notice rules.
 * @returns {string | null} what is wrong, or null when it is fine
 */
const checkDeliverySchedule = (date, slot, now = new Date()) => {
  const start = slotStartInstant(date, slot);
  const hoursAway = (start.getTime() - now.getTime()) / 3600000;

  if (hoursAway < MIN_NOTICE_HOURS) {
    return `Deliveries need at least ${MIN_NOTICE_HOURS} hours' notice. Please choose a later date or time.`;
  }
  if (hoursAway > MAX_DAYS_AHEAD * 24) {
    return `Deliveries can be booked up to ${MAX_DAYS_AHEAD} days ahead.`;
  }
  return null;
};

module.exports = {
  TIME_SLOTS,
  MIN_NOTICE_HOURS,
  MAX_DAYS_AHEAD,
  NEPAL_OFFSET_MS,
  slotStartHour,
  slotStartInstant,
  checkDeliverySchedule,
};
