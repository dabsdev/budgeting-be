import { HTTPException } from "hono/http-exception";
import { DrizzleD1 } from "../../config/db";
import { deleteRecord, insertRecord, updateRecord } from "../../lib/drizzle.d1";
import { RecurringReminderInputType } from "./recurring-reminder.schema";
import { recurringReminders } from "./recurring-reminder.table";
import { wallets } from "../wallet/wallet.table";
import { and, eq, like } from "drizzle-orm";

export const createRecurringReminder = async (db: DrizzleD1, user_id: string, data: RecurringReminderInputType) => {
    const walletExists = await db.select()
        .from(wallets)
        .where(and(eq(wallets.id, data.wallet_id), eq(wallets.user_id, user_id), eq(wallets.is_deleted, false)))
        .limit(1);
    
    if (walletExists.length === 0) {
        throw new HTTPException(400, { message: "Wallet not found or access denied." });
    }

    const result = await insertRecord(db, recurringReminders, { ...data, user_id })
    if (!result) throw new HTTPException(400, { message: "Failed create new recurring reminders." })

    return result
}

export const getAllRecurringReminders = async (db: DrizzleD1, user_id: string, search?: string) => {
    let where = and(
        eq(recurringReminders.user_id, user_id),
        eq(recurringReminders.is_deleted, false)
    )

    if (search) {
        where = and(where, like(recurringReminders.description, `%${search}%`))
    }

    const result = await db
        .select()
        .from(recurringReminders)
        .where(where)

    return result
}

export const updateRecurringReminder = async (db: DrizzleD1, user_id: string, recurring_reminder_id: string, data: RecurringReminderInputType) => {
    const walletExists = await db.select()
        .from(wallets)
        .where(and(eq(wallets.id, data.wallet_id), eq(wallets.user_id, user_id), eq(wallets.is_deleted, false)))
        .limit(1);
    
    if (walletExists.length === 0) {
        throw new HTTPException(400, { message: "Wallet not found or access denied." });
    }

    const result = await updateRecord(
        db,
        recurringReminders,
        and(eq(recurringReminders.id, recurring_reminder_id), eq(recurringReminders.user_id, user_id), eq(recurringReminders.is_deleted, false))!,
        data
    );
    if (!result) throw new HTTPException(404, { message: "Recurring reminder not found or access denied." });

    return result;
};

export const deleteRecurringReminder = async (db: DrizzleD1, user_id: string, recurring_reminder_id: string) => {
    const result = await deleteRecord(
        db,
        recurringReminders,
        and(eq(recurringReminders.id, recurring_reminder_id), eq(recurringReminders.user_id, user_id), eq(recurringReminders.is_deleted, false))!
    );
    if (!result) throw new HTTPException(404, { message: "Recurring reminder not found or access denied." });
};