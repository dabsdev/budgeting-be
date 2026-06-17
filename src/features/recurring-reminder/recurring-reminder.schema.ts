import { z } from "zod";

export const recurringReminderSchema = z.object({
    description: z.string().nonempty("Description cannot be empty."),
    amount: z.number().nonnegative("Amount must be a non-negative number."),
    day_of_month: z.number().min(1, "Day of month must be at least 1.").max(31, "Day of month must be at most 31."),
    is_active: z.boolean().default(true),
})

export type RecurringReminderInputType = z.infer<typeof recurringReminderSchema>;