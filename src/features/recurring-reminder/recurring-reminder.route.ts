import { Hono } from "hono";
import { AppEnv } from "../../config/env";
import { apiMiddleware } from "../../middleware/api/api.middleware";
import { isLoggedIn } from "../../middleware/auth/auth.middleware";
import { zValidator } from "../../middleware/api/api.validationError";
import { recurringReminderSchema } from "./recurring-reminder.schema";
import { createRecurringReminder, deleteRecurringReminder, getAllRecurringReminders, updateRecurringReminder } from "./recurring-reminder.service";
import { db } from "../../config/db";

export const recurringReminderRoutes = new Hono<AppEnv>()
    .use(apiMiddleware, isLoggedIn)
    .post("/recurring-reminders", zValidator("json", recurringReminderSchema), async (c) => {
        const body = c.req.valid("json")
        const { id } = c.get("user")

        const result = await createRecurringReminder(db(c.env.DB), id, body)
        return c.api.success(result, "Success create new recurring reminder.", 201)
    })
    .get("/recurring-reminders", async (c) => {
        const { id } = c.get("user")
        const page = Math.max(1, parseInt(c.req.query("page") || "1", 10));
        const limit = Math.max(1, Math.min(100, parseInt(c.req.query("limit") || "10", 10)));
        const search = c.req.query("search")

        const { data, pagination } = await getAllRecurringReminders(db(c.env.DB), id, page, limit, search)

        return c.api.success(data, "Success get all recurring reminders.", 200, pagination)
    })
    .put("/recurring-reminders/:id", zValidator("json", recurringReminderSchema), async (c) => {
        const body = c.req.valid("json")
        const recurring_reminder_id = c.req.param("id")

        const result = await updateRecurringReminder(db(c.env.DB), recurring_reminder_id, body)
        return c.api.success(result, "Success update recurring reminder.", 200)
    })
    .delete("/recurring-reminders/:id", async (c) => {
        const recurring_reminder_id = c.req.param("id")

        await deleteRecurringReminder(db(c.env.DB), recurring_reminder_id)
        return c.body(null, 204)
    })