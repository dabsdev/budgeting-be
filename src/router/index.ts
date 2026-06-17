import { authRoutes } from "../features/auth/auth.route";
import { recurringReminderRoutes } from "../features/recurring-reminder/recurring-reminder.route";
import { walletRoutes } from "../features/wallet/wallet.route";

export const router = [
    {
        path: "/auth",
        handler: authRoutes
    },
    {
        path: "/",
        handler: walletRoutes
    },
    {
        path: "/",
        handler: recurringReminderRoutes
    }
]