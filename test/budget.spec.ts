import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { db as connectDb } from "../src/config/db";
import { budgets } from "../src/features/budget/budget.table";
import { getAllBudgets } from "../src/features/budget/budget.service";
import { wallets } from "../src/features/wallet/wallet.table";
import { transactions } from "../src/features/transaction/transaction.table";
import { users } from "../src/features/user/user.table";
import { eq } from "drizzle-orm";

import sql0 from "../src/database/migrations/0000_hard_outlaw_kid.sql?raw";
import sql1 from "../src/database/migrations/0001_shocking_sage.sql?raw";
import sql2 from "../src/database/migrations/0002_aspiring_molly_hayes.sql?raw";
import sql3 from "../src/database/migrations/0003_magenta_odin.sql?raw";
import sql4 from "../src/database/migrations/0004_productive_william_stryker.sql?raw";
import sql5 from "../src/database/migrations/0005_familiar_magdalene.sql?raw";
import sql6 from "../src/database/migrations/0006_lucky_black_tom.sql?raw";
import sql7 from "../src/database/migrations/0007_melted_tinkerer.sql?raw";
import sql8 from "../src/database/migrations/0008_unique_lord_hawal.sql?raw";
import sql9 from "../src/database/migrations/0009_lonely_morph.sql?raw";
import sql10 from "../src/database/migrations/0010_wild_gambit.sql?raw";
import sql12 from "../src/database/migrations/0012_add_last_notified_month_year.sql?raw";
import sql13 from "../src/database/migrations/0013_add_user_salary_day.sql?raw";

const applyMigrations = async (d1: D1Database) => {
    const migrations = [sql0, sql1, sql2, sql3, sql4, sql5, sql6, sql7, sql8, sql9, sql10, sql12, sql13];
    for (const sql of migrations) {
        const statements = sql.split("--> statement-breakpoint");
        for (const statement of statements) {
            const trimmed = statement.trim();
            if (trimmed) {
                const singleLineSql = trimmed.replace(/\s+/g, " ");
                await d1.exec(singleLineSql);
            }
        }
    }
};

describe("Budget Filter Unit Tests", () => {
    let db: any;

    beforeEach(async () => {
        await applyMigrations(env.DB);
        db = connectDb(env.DB);

        // Seed with test users
        await db.insert(users).values({
            id: "user1",
            name: "User One",
            email: "user1@example.com",
            phone_number: "0812",
            password: "hash",
            salary_day: 1
        });
        await db.insert(users).values({
            id: "user2",
            name: "User Two",
            email: "user2@example.com",
            phone_number: "0813",
            password: "hash",
            salary_day: 1
        });

        // Seed with test wallets for user1
        await db.insert(wallets).values({
            id: "w1",
            user_id: "user1",
            name: "Wallet A",
            balance: "10000",
            is_deleted: false
        });

        // Seed with test budgets for user 'user1'
        const dummyBudgets = [
            { id: "b1", user_id: "user1", category: "Food", amount: 1000, month_year: "2026-06", is_deleted: false },
            { id: "b2", user_id: "user1", category: "Rent", amount: 5000, month_year: "2026-06", is_deleted: false },
            { id: "b3", user_id: "user1", category: "Utilities", amount: 500, month_year: "2026-07", is_deleted: false },
            { id: "b4", user_id: "user1", category: "Entertainment", amount: 300, month_year: "2025-06", is_deleted: false },
            { id: "b5", user_id: "user2", category: "Food", amount: 1000, month_year: "2026-06", is_deleted: false }, // different user
        ];

        for (const b of dummyBudgets) {
            await db.insert(budgets).values(b);
        }
    });

    it("should return all active budgets for user when no filter is provided", async () => {
        const { data } = await getAllBudgets(db, "user1", {});
        expect(data).toHaveLength(4);
        const ids = data.map((b: any) => b.id).sort();
        expect(ids).toEqual(["b1", "b2", "b3", "b4"]);
    });

    it("should return budgets sorted by category asc by default", async () => {
        const { data } = await getAllBudgets(db, "user1", {});
        expect(data).toHaveLength(4);
        const categories = data.map((b: any) => b.category);
        expect(categories).toEqual(["Entertainment", "Food", "Rent", "Utilities"]);
    });

    it("should return budgets sorted by category desc when requested", async () => {
        const { data } = await getAllBudgets(db, "user1", { sort_by: "category", sort_order: "desc" });
        expect(data).toHaveLength(4);
        const categories = data.map((b: any) => b.category);
        expect(categories).toEqual(["Utilities", "Rent", "Food", "Entertainment"]);
    });

    it("should filter by month_year exactly", async () => {
        const { data } = await getAllBudgets(db, "user1", { month_year: "2026-06" });
        expect(data).toHaveLength(2);
        const ids = data.map((b: any) => b.id).sort();
        expect(ids).toEqual(["b1", "b2"]);
    });

    it("should compute spent, remaining, and zero-based budgeting summary correctly", async () => {
        // 1. Insert an IN transaction (Income) for user1 in 2026-06
        await db.insert(transactions).values({
            id: "t-inc",
            user_id: "user1",
            wallet_id: "w1",
            type: "IN",
            description: "Salary",
            amount: 10000,
            transaction_date: "2026-06-01",
            is_deleted: false
        });

        // 2. Insert an OUT transaction (Expense) linked to budget b1
        await db.insert(transactions).values({
            id: "t-exp1",
            user_id: "user1",
            wallet_id: "w1",
            budget_id: "b1",
            type: "OUT",
            description: "Groceries",
            amount: 300,
            transaction_date: "2026-06-02",
            is_deleted: false
        });

        // 3. Fetch budgets and verify
        const { data, summary } = await getAllBudgets(db, "user1", { month_year: "2026-06" });

        expect(summary.total_income).toBe(10000);
        expect(summary.total_allocated).toBe(6000); // b1 (1000) + b2 (5000)
        expect(summary.unallocated_amount).toBe(4000); // 10000 - 6000

        const budgetB1 = data.find((b: any) => b.id === "b1");
        expect(budgetB1).toBeDefined();
        expect(budgetB1.spent).toBe(300);
        expect(budgetB1.remaining).toBe(700);

        const budgetB2 = data.find((b: any) => b.id === "b2");
        expect(budgetB2).toBeDefined();
        expect(budgetB2.spent).toBe(0);
        expect(budgetB2.remaining).toBe(5000);
    });

    it("should compute cycles correctly when user has custom salary_day = 25", async () => {
        // Update user1's salary_day to 25
        await db.update(users).set({ salary_day: 25 }).where(eq(users.id, "user1"));

        // 1. Insert an IN transaction (Income) on 2026-06-25 (starts the July budget cycle under Model B)
        await db.insert(transactions).values({
            id: "t-inc-jun",
            user_id: "user1",
            wallet_id: "w1",
            type: "IN",
            description: "June 25 salary (funds July)",
            amount: 12000,
            transaction_date: "2026-06-25",
            is_deleted: false
        });

        // 2. Insert an IN transaction (Income) on 2026-06-24 (belongs to June cycle under Model B)
        await db.insert(transactions).values({
            id: "t-inc-may",
            user_id: "user1",
            wallet_id: "w1",
            type: "IN",
            description: "June 24 income (funds June)",
            amount: 5000,
            transaction_date: "2026-06-24",
            is_deleted: false
        });

        // 3. Insert an OUT transaction (Expense) on 2026-07-24 (inside the July budget cycle)
        await db.insert(transactions).values({
            id: "t-exp-inside",
            user_id: "user1",
            wallet_id: "w1",
            budget_id: "b3", // b3 is for month_year: "2026-07"
            type: "OUT",
            description: "Rent pay inside July cycle",
            amount: 400,
            transaction_date: "2026-07-24",
            is_deleted: false
        });

        // 4. Insert an OUT transaction (Expense) on 2026-07-25 (outside July cycle, starts August cycle)
        await db.insert(transactions).values({
            id: "t-exp-outside",
            user_id: "user1",
            wallet_id: "w1",
            budget_id: "b3",
            type: "OUT",
            description: "Rent pay inside August cycle",
            amount: 600,
            transaction_date: "2026-07-25",
            is_deleted: false
        });

        // 5. Query July budgets and verify
        const { data, summary } = await getAllBudgets(db, "user1", { month_year: "2026-07" });

        // Under Model B: July cycle runs from June 25 to July 24
        // Total income should only be 12000 (from 2026-06-25), the 5000 on 2026-06-24 belongs to the June cycle
        expect(summary.total_income).toBe(12000);
        expect(summary.total_allocated).toBe(500); // b3 amount is 500
        expect(summary.unallocated_amount).toBe(11500); // 12000 - 500

        const budgetB3 = data.find((b: any) => b.id === "b3");
        expect(budgetB3).toBeDefined();
        // Spent should be 400 (from 2026-07-24), because 600 on 2026-07-25 belongs to the August cycle
        expect(budgetB3.spent).toBe(400);
        expect(budgetB3.remaining).toBe(100);
    });
});
