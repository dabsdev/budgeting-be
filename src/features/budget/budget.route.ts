import { Hono } from "hono";
import { AppEnv } from "../../config/env";
import { apiMiddleware } from "../../middleware/api/api.middleware";
import { isLoggedIn } from "../../middleware/auth/auth.middleware";
import { zValidator } from "../../middleware/api/api.validationError";
import { budgetSchema } from "./budget.schema";
import { createBudget, deleteBudget, getAllBudgets, updateBudget } from "./budget.service";
import { db } from "../../config/db";

export const budgetRoutes = new Hono<AppEnv>()
    .use(apiMiddleware, isLoggedIn)
    .post("/budgets", zValidator("json", budgetSchema), async (c) => {
        const body = c.req.valid("json")
        const { id } = c.get("user")

        const result = await createBudget(db(c.env.DB), id, body)

        return c.api.success(result, "Success create new budget.", 201)
    })
    .get("/budgets", async (c) => {
        const { page, limit, month_year, sort_by, sort_order } = c.req.query()
        const { id } = c.get("user")

        if (month_year && !/^\d{4}-\d{2}$/.test(month_year)) {
            return c.api.error("Invalid month year format. Use YYYY-MM.", 400);
        }

        if (sort_order && sort_order !== "asc" && sort_order !== "desc") {
            return c.api.error("Invalid sort_order. Must be 'asc' or 'desc'.", 400);
        }

        const { data, summary, pagination } = await getAllBudgets(db(c.env.DB), id, {
            page: page ? Number(page) : undefined,
            limit: limit ? Number(limit) : undefined,
            month_year,
            sort_by,
            sort_order: sort_order as "asc" | "desc" | undefined
        })

        return c.api.success(data, "Success get all budgets.", 200, pagination, { summary })
    })
    .put("/budgets/:id", zValidator("json", budgetSchema), async (c) => {
        const body = c.req.valid("json")
        const budget_id = c.req.param("id")
        const { id: user_id } = c.get("user")

        const result = await updateBudget(db(c.env.DB), user_id, budget_id, body)

        return c.api.success(result, "Success update budget.", 200)
    })
    .delete("/budgets/:id", async (c) => {
        const budget_id = c.req.param("id")
        const { id: user_id } = c.get("user")

        await deleteBudget(db(c.env.DB), user_id, budget_id)

        return c.body(null, 204)
    })