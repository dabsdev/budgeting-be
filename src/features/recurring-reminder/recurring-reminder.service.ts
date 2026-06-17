import { HTTPException } from "hono/http-exception";
import { DrizzleD1 } from "../../config/db";
import { deleteRecord, findManyWithIdPagination, insertRecord, updateRecord } from "../../lib/drizzle.d1";
import { RecurringReminderInputType } from "./recurring-reminder.schema";
import { recurringReminders } from "./recurring-reminder.table";
import { and, eq, inArray, like, SQL } from "drizzle-orm";

export const createRecurringReminder = async (db: DrizzleD1, user_id: string, data: RecurringReminderInputType) => {
    const result = await insertRecord(db, recurringReminders, { ...data, user_id })
    if (!result) throw new HTTPException(400, { message: "Failed create new recurring reminders." })

    return result
}

export const getAllRecurringReminders = async (db: DrizzleD1, user_id: string, page?: number, limit?: number, search?: string) => {
    let where = and(
        eq(recurringReminders.user_id, user_id),
        eq(recurringReminders.is_deleted, false)
    )

    if (search) {
        where = and(where, like(recurringReminders.description, `%${search}%`))
    }

    const result = await findManyWithIdPagination(
        db,
        recurringReminders,
        where,
        { page, limit },
        async (currentPageIds) => {
            return await db
                .select()
                .from(recurringReminders)
                .where(inArray(recurringReminders.id, currentPageIds))
        }
    )

    return result
}

export const updateRecurringReminder = async (db: DrizzleD1, recurring_reminder_id: string, data: RecurringReminderInputType) => {
    const result = await updateRecord(db, recurringReminders, eq(recurringReminders.id, recurring_reminder_id), data)
    if (!result) throw new HTTPException(400, { message: "Failed update recurring reminder." })

    return result
}

export const deleteRecurringReminder = async (db: DrizzleD1, recurring_reminder_id: string) => {
    const result = await deleteRecord(db, recurringReminders, and(eq(recurringReminders.id, recurring_reminder_id), eq(recurringReminders.is_deleted, false))!)
    if (!result) throw new HTTPException(400, { message: "Failed delete recurring reminder." })
}