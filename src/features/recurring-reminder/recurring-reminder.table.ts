import { integer, sqliteTable, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const recurringReminders = sqliteTable("recurring_reminders", {
    id: text("id")
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    user_id: text("user_id").notNull(),
    wallet_id: text("wallet_id"),
    description: text("description").notNull(),
    amount: integer("amount").notNull(),
    day_of_month: integer("day_of_month").notNull(),
    is_active: integer("is_active", { mode: "boolean" }).notNull().default(true),
    is_deleted: integer("is_deleted", { mode: "boolean" }).notNull().default(false),
    created_at: text("created_at")
        .notNull()
        .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updated_at: text("updated_at"),
    deleted_at: text("deleted_at")
}, (table) => {
    return {
        idxRecurringRemindersIsDeleted: index("idx_recurring_reminders_is_deleted").on(table.is_deleted),
        idxRecurringRemindersIsActive: index("idx_recurring_reminders_is_active").on(table.is_active),
        idxRecurringRemindersUserId: index("idx_recurring_reminders_user_id").on(table.user_id),
        idxRecurringRemindersWalletId: index("idx_recurring_reminders_wallet_id").on(table.wallet_id),
        idxRecurringRemindersDescription: index("idx_recurring_reminders_description").on(sql`${table.description} COLLATE NOCASE`),
    }
});

// ── Inferred Types ─────────────────────────────────────────────────────────────
export type RecurringReminderSelect = typeof recurringReminders.$inferSelect;
export type RecurringReminderInsert = typeof recurringReminders.$inferInsert;
