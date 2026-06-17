import { Hono } from "hono";
import { AppEnv } from "../../config/env";
import { apiMiddleware } from "../../middleware/api/api.middleware";
import { isLoggedIn } from "../../middleware/auth/auth.middleware";
import { zValidator } from "../../middleware/api/api.validationError";
import { transactionSchema, transferSchema } from "./transaction.schema";
import {
    createTransaction,
    createTransfer,
    deleteTransaction,
    getAllTransactions,
    updateTransaction
} from "./transaction.service";
import { db } from "../../config/db";

export const transactionRoutes = new Hono<AppEnv>()
    .use(apiMiddleware, isLoggedIn)
    .post("/transactions", zValidator("json", transactionSchema), async (c) => {
        const body = c.req.valid("json");
        const { id } = c.get("user");

        const result = await createTransaction(db(c.env.DB), id, body);
        return c.api.success(result, "Success create new transaction.", 201);
    })
    .post("/transactions/transfer", zValidator("json", transferSchema), async (c) => {
        const body = c.req.valid("json");
        const { id } = c.get("user");

        const result = await createTransfer(db(c.env.DB), id, body);
        return c.api.success(result, "Success create new transfer.", 201);
    })
    .get("/transactions", async (c) => {
        const { page, limit, wallet_id, type, search } = c.req.query();
        const { id } = c.get("user");

        const { data, pagination } = await getAllTransactions(db(c.env.DB), id, {
            page: page ? Number(page) : undefined,
            limit: limit ? Number(limit) : undefined,
            wallet_id,
            type: type as "IN" | "OUT" | undefined,
            search
        });

        return c.api.success(data, "Success get all transactions.", 200, pagination);
    })
    .put("/transactions/:id", zValidator("json", transactionSchema), async (c) => {
        const body = c.req.valid("json");
        const transaction_id = c.req.param("id");
        const { id } = c.get("user");

        const result = await updateTransaction(db(c.env.DB), id, transaction_id, body);
        return c.api.success(result, "Success update transaction.", 200);
    })
    .delete("/transactions/:id", async (c) => {
        const transaction_id = c.req.param("id");
        const { id } = c.get("user");

        await deleteTransaction(db(c.env.DB), id, transaction_id);
        return c.body(null, 204);
    });
