import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type Num = Decimal.Value | null | undefined;

export const D = (v: Num) => new Decimal(v == null || v === '' ? 0 : v);

/** Round to 2dp and return a string suitable for numeric(18,2). */
export const m2 = (v: Num) => D(v).toDecimalPlaces(2).toFixed(2);
export const q4 = (v: Num) => D(v).toDecimalPlaces(4).toFixed(4);
export const r6 = (v: Num) => D(v).toDecimalPlaces(6).toFixed(6);

export const sum = (values: Num[]) => values.reduce<Decimal>((acc, v) => acc.plus(D(v)), new Decimal(0));

/** amount × percent / 100, rounded to 2dp */
export const pct = (amount: Num, percent: Num) => D(amount).times(D(percent)).dividedBy(100).toDecimalPlaces(2);

export { Decimal };
