import { HTTPException } from "hono/http-exception";
import { DrizzleD1 } from "../../config/db";
import { deleteRecord, findManyWithIdPagination, insertRecord, updateRecord } from "../../lib/drizzle.d1";
import { BudgetInputType } from "./budget.schema";
import { budgets } from "./budget.table";
import { and, eq, gte, inArray, isNull, like, lte, sql } from "drizzle-orm";
import { transactions } from "../transaction/transaction.table";
import { users } from "../user/user.table";
import { getCycleDateRange } from "../../lib/date";

export const createBudget = async (db: DrizzleD1, user_id: string, data: BudgetInputType) => {
    const result = await insertRecord(db, budgets, { ...data, user_id })
    if (!result) throw new HTTPException(400, { message: "Failed create new budget." })

    return result
}

export const getAllBudgets = async (
    db: DrizzleD1,
    user_id: string,
    options: { page?: number; limit?: number; month_year?: string; sort_by?: string; sort_order?: "asc" | "desc"; }
) => {
    const monthYear = options.month_year || new Date().toISOString().substring(0, 7);

    // 0. Load user's salary_day to compute the cycle rentang tanggal
    const userResult = await db
        .select({ salary_day: users.salary_day })
        .from(users)
        .where(eq(users.id, user_id))
        .limit(1);
    const salaryDay = userResult[0]?.salary_day ?? 1;

    const { startDate, endDate } = getCycleDateRange(monthYear, salaryDay);

    // 1. Calculate total income in this cycle (from IN transactions within cycle dates)
    const incomeResult = await db
        .select({
            total: sql<number>`CAST(COALESCE(SUM(${transactions.amount}), 0) AS REAL)`
        })
        .from(transactions)
        .where(
            and(
                eq(transactions.user_id, user_id),
                eq(transactions.is_deleted, false),
                eq(transactions.type, "IN"),
                isNull(transactions.linked_transaction_id),
                gte(transactions.transaction_date, startDate),
                lte(transactions.transaction_date, endDate)
            )
        );
    const totalIncome = Number(incomeResult[0]?.total) || 0;

    // 2. Calculate total allocated in monthYear (sum of all budgets in monthYear)
    const allocatedResult = await db
        .select({
            total: sql<number>`CAST(COALESCE(SUM(${budgets.amount}), 0) AS REAL)`
        })
        .from(budgets)
        .where(
            and(
                eq(budgets.user_id, user_id),
                eq(budgets.is_deleted, false),
                eq(budgets.month_year, monthYear)
            )
        );
    const totalAllocated = Number(allocatedResult[0]?.total) || 0;

    const unallocatedAmount = totalIncome - totalAllocated;

    let whereClause = and(
        eq(budgets.user_id, user_id),
        eq(budgets.is_deleted, false)
    );

    if (options.month_year) {
        whereClause = and(whereClause, eq(budgets.month_year, options.month_year));
    }

    const paginatedResult = await findManyWithIdPagination(
        db,
        budgets,
        whereClause,
        {
            page: options.page,
            limit: options.limit,
            sortColumn: options.sort_by || "category",
            sortOrder: options.sort_order || "asc"
        },
        async (currentIds) => {
            return await db
                .select({
                    id: budgets.id,
                    user_id: budgets.user_id,
                    category: budgets.category,
                    amount: budgets.amount,
                    month_year: budgets.month_year,
                    is_deleted: budgets.is_deleted,
                    created_at: budgets.created_at,
                    updated_at: budgets.updated_at,
                    spent: sql<number>`CAST(COALESCE(SUM(${transactions.amount}), 0) AS REAL)`
                })
                .from(budgets)
                .leftJoin(
                    transactions,
                    and(
                        eq(budgets.id, transactions.budget_id),
                        eq(transactions.is_deleted, false),
                        eq(transactions.type, "OUT"),
                        gte(transactions.transaction_date, startDate),
                        lte(transactions.transaction_date, endDate)
                    )
                )
                .where(inArray(budgets.id, currentIds))
                .groupBy(budgets.id);
        }
    );

    const formattedData = paginatedResult.data.map((row: any) => ({
        ...row,
        spent: Number(row.spent) || 0,
        remaining: (row.amount || 0) - (Number(row.spent) || 0)
    }));

    return {
        data: formattedData,
        summary: {
            month_year: monthYear,
            total_income: totalIncome,
            total_allocated: totalAllocated,
            unallocated_amount: unallocatedAmount
        },
        pagination: paginatedResult.pagination
    };
}

export const updateBudget = async (db: DrizzleD1, user_id: string, budget_id: string, data: BudgetInputType) => {
    const result = await updateRecord(
        db,
        budgets,
        and(eq(budgets.id, budget_id), eq(budgets.user_id, user_id), eq(budgets.is_deleted, false))!,
        data
    );
    if (!result) throw new HTTPException(404, { message: "Budget category not found or access denied." });

    return result;
};

export const deleteBudget = async (db: DrizzleD1, user_id: string, budget_id: string) => {
    const result = await deleteRecord(
        db,
        budgets,
        and(eq(budgets.id, budget_id), eq(budgets.user_id, user_id), eq(budgets.is_deleted, false))!
    );
    if (!result) throw new HTTPException(404, { message: "Budget category not found or access denied." });
};