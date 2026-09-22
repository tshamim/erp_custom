import { uuid, timestamp, numeric } from 'drizzle-orm/pg-core';

export const id = () => uuid('id').primaryKey().defaultRandom();
export const timestamps = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
/** Money: 18 digits, 2 decimals. Drizzle returns these as strings — never sum them with JS floats. */
export const money = (name: string) => numeric(name, { precision: 18, scale: 2 });
export const qty = (name: string) => numeric(name, { precision: 18, scale: 4 });
export const rate = (name: string) => numeric(name, { precision: 18, scale: 6 });
