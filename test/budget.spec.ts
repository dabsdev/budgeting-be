import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { db as connectDb } from "../src/config/db";
import { budgets } from "../src/features/budget/budget.table";
import { getAllBudgets } from "../src/features/budget/budget.service";

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
import sql11 from "../src/database/migrations/0011_red_iron_monger.sql?raw";

const applyMigrations = async (d1: D1Database) => {
    const migrations = [sql0, sql1, sql2, sql3, sql4, sql5, sql6, sql7, sql8, sql9, sql10, sql11];
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

    it("should filter by month_year exactly", async () => {
        const { data } = await getAllBudgets(db, "user1", { month_year: "2026-06" });
        expect(data).toHaveLength(2);
        const ids = data.map((b: any) => b.id).sort();
        expect(ids).toEqual(["b1", "b2"]);
    });
});
