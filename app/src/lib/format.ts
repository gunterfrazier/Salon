/** $125 or $118.75 */
export const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

/** 45 min, 2 hr, 2 hr 15 min */
export const duration = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);

export const fullName = (first: string, last?: string | null) => [first, last].filter(Boolean).join(" ");
