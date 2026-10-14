export const round2 = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function sum(values) {
  return values.reduce((acc, value) => acc + Number(value || 0), 0);
}

export function isoDatePlusDays(startDate, offsetDays) {
  const d = new Date(`${startDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export function dayName(dateString) {
  return new Intl.DateTimeFormat('en-AU', { weekday: 'long', timeZone: 'UTC' })
    .format(new Date(`${dateString}T00:00:00Z`));
}

export function percent(numerator, denominator) {
  if (!denominator) return 0;
  return (Number(numerator) / Number(denominator)) * 100;
}

export function safeJsonParse(value, fallback = {}) {
  try { return JSON.parse(value); } catch { return fallback; }
}
