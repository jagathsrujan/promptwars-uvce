// Money and date formatting. All timestamps are rendered in Asia/Kolkata (IST).

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
});

const istDateTime = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

const istDateTimeLong = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

const istDate = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

// YYYY-MM-DD in IST — used for date filtering (lexicographic comparison).
const istIsoDate = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Kolkata",
});

export function formatINR(value: number | string): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "₹0.00";
  return inr.format(n);
}

export function formatSignedINR(value: number | string, direction: "CREDIT" | "DEBIT"): string {
  const formatted = formatINR(value);
  return direction === "CREDIT" ? `+${formatted}` : `−${formatted}`;
}

/** Sums money exactly (integer paise) — for display-only totals. */
export function sumINR(values: Array<number | string>): number {
  const paise = values.reduce<number>((acc, v) => {
    const n = typeof v === "string" ? Number(v) : v;
    return acc + Math.round((Number.isFinite(n) ? n : 0) * 100);
  }, 0);
  return paise / 100;
}

export function formatIST(iso: string | Date): string {
  return istDateTime.format(new Date(iso));
}

export function formatISTLong(iso: string | Date): string {
  return istDateTimeLong.format(new Date(iso));
}

export function formatISTDate(iso: string | Date): string {
  return istDate.format(new Date(iso));
}

/** Calendar date in IST as YYYY-MM-DD. */
export function toISTDateKey(iso: string | Date): string {
  return istIsoDate.format(new Date(iso));
}

export function maskAccountNumber(accountNumber: string): string {
  return `••••${accountNumber.slice(-4)}`;
}

export function maskCardNumber(last4: string): string {
  return `•••• •••• •••• ${last4}`;
}

export function formatExpiry(month: number, year: number): string {
  return `${String(month).padStart(2, "0")}/${String(year).slice(-2)}`;
}

const istToday = new Intl.DateTimeFormat("en-IN", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

const istHour = new Intl.DateTimeFormat("en-GB", {
  hour: "numeric",
  hour12: false,
  timeZone: "Asia/Kolkata",
});

/** e.g. "Saturday, 11 October 2026" in IST. */
export function formatISTToday(): string {
  return istToday.format(new Date());
}

/** Time-of-day greeting according to the IST clock. */
export function greetingIST(): string {
  const hour = Number(istHour.format(new Date()));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
