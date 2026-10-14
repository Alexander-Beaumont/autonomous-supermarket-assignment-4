export const money = value => new Intl.NumberFormat('en-AU', {
  style:'currency', currency:'AUD', minimumFractionDigits:2, maximumFractionDigits:2
}).format(Number(value || 0));

export const integer = value => new Intl.NumberFormat('en-AU', { maximumFractionDigits:0 }).format(Number(value || 0));
export const decimal = (value, digits = 2) => Number(value || 0).toFixed(digits);
export const pct = (value, digits = 1) => `${Number(value || 0).toFixed(digits)}%`;
export const dateAU = value => value ? new Intl.DateTimeFormat('en-AU', { day:'2-digit', month:'short', year:'numeric' }).format(new Date(`${value}T00:00:00`)) : '—';
