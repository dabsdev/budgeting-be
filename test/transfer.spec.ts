import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { db as connectDb } from "../src/config/db";
import { wallets } from "../src/features/wallet/wallet.table";
import { transactions } from "../src/features/transaction/transaction.table";
import { createTransaction, createTransfer, deleteTransaction, updateTransaction, getAllTransactions } from "../src/features/transaction/transaction.service";

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

describe("Wallet Transfer Unit Tests", () => {
    let db: any;

    beforeEach(async () => {
        await applyMigrations(env.DB);
        db = connectDb(env.DB);

        // Seed with two wallets for user1
        await db.insert(wallets).values({
            id: "w1",
            user_id: "user1",
            name: "Wallet A",
            balance: "10000",
            is_deleted: false
        });

        await db.insert(wallets).values({
            id: "w2",
            user_id: "user1",
            name: "Wallet B",
            balance: "2000",
            is_deleted: false
        });
    });

    it("should successfully transfer funds between wallets", async () => {
        const result = await createTransfer(db, "user1", {
            source_wallet_id: "w1",
            destination_wallet_id: "w2",
            amount: 3000,
            transaction_date: "2026-06-17"
        });

        expect(result.outTx.wallet_id).toBe("w1");
        expect(result.outTx.type).toBe("OUT");
        expect(result.outTx.amount).toBe(3000);
        expect(result.outTx.linked_transaction_id).toBe(result.inTx.id);

        expect(result.inTx.wallet_id).toBe("w2");
        expect(result.inTx.type).toBe("IN");
        expect(result.inTx.amount).toBe(3000);
        expect(result.inTx.linked_transaction_id).toBe(result.outTx.id);

        // Verify wallet balances
        const walletAResult = await db.select().from(wallets).where(eq(wallets.id, "w1")).limit(1);
        expect(Number(walletAResult[0].balance)).toBe(7000);

        const walletBResult = await db.select().from(wallets).where(eq(wallets.id, "w2")).limit(1);
        expect(Number(walletBResult[0].balance)).toBe(5000);
    });

    it("should fail transfer if source wallet balance is insufficient", async () => {
        await expect(createTransfer(db, "user1", {
            source_wallet_id: "w1",
            destination_wallet_id: "w2",
            amount: 15000, // exceeds Wallet A balance (10000)
            transaction_date: "2026-06-17"
        })).rejects.toThrow("Insufficient balance in source wallet.");
    });

    it("should fail transfer if source and destination wallets are the same", async () => {
        await expect(createTransfer(db, "user1", {
            source_wallet_id: "w1",
            destination_wallet_id: "w1",
            amount: 1000,
            transaction_date: "2026-06-17"
        })).rejects.toThrow("Source wallet and destination wallet must be different.");
    });

    it("should fail transaction creation if wallet balance is insufficient for OUT transaction", async () => {
        await expect(createTransaction(db, "user1", {
            wallet_id: "w1",
            budget_id: null,
            type: "OUT",
            description: "Expense",
            amount: 15000, // exceeds Wallet A balance (10000)
            transaction_date: "2026-06-17"
        })).rejects.toThrow("Insufficient balance in wallet.");
    });

    it("should fail transaction update if wallet balance is insufficient for OUT transaction", async () => {
        // Create an initial transaction (OUT of 3000, leaving 7000 in w1)
        const tx = await createTransaction(db, "user1", {
            wallet_id: "w1",
            budget_id: null,
            type: "OUT",
            description: "Expense",
            amount: 3000,
            transaction_date: "2026-06-17"
        });

        // Updating it to 12000 (exceeds total starting balance of 10000) must reject
        await expect(updateTransaction(db, "user1", tx.id, {
            wallet_id: "w1",
            budget_id: null,
            type: "OUT",
            description: "Expense modified",
            amount: 12000,
            transaction_date: "2026-06-17"
        })).rejects.toThrow("Insufficient balance in wallet.");
    });

    it("should delete both sides of a transfer and revert balances", async () => {
        // 1. Perform a transfer
        const result = await createTransfer(db, "user1", {
            source_wallet_id: "w1",
            destination_wallet_id: "w2",
            amount: 3000,
            transaction_date: "2026-06-17"
        });

        // 2. Delete the OUT transaction side
        await deleteTransaction(db, "user1", result.outTx.id);

        // 3. Verify both transactions are soft-deleted (is_deleted = true)
        const deletedOut = await db.select().from(transactions).where(eq(transactions.id, result.outTx.id)).limit(1);
        expect(deletedOut[0].is_deleted).toBe(true);

        const deletedIn = await db.select().from(transactions).where(eq(transactions.id, result.inTx.id)).limit(1);
        expect(deletedIn[0].is_deleted).toBe(true);

        // 4. Verify balances are reverted
        const walletAResult = await db.select().from(wallets).where(eq(wallets.id, "w1")).limit(1);
        expect(Number(walletAResult[0].balance)).toBe(10000);

        const walletBResult = await db.select().from(wallets).where(eq(wallets.id, "w2")).limit(1);
        expect(Number(walletBResult[0].balance)).toBe(2000);
    });

    it("should block updating wallet, amount, type, or budget on a transfer transaction", async () => {
        const result = await createTransfer(db, "user1", {
            source_wallet_id: "w1",
            destination_wallet_id: "w2",
            amount: 3000,
            transaction_date: "2026-06-17"
        });

        // Attempting to change amount must reject
        await expect(updateTransaction(db, "user1", result.outTx.id, {
            wallet_id: "w1",
            budget_id: null,
            type: "OUT",
            description: "Transfer of Funds",
            amount: 4000, // modified
            transaction_date: "2026-06-17"
        })).rejects.toThrow("Cannot modify amount, wallet, or type of a transfer transaction");

        // Attempting to change type must reject
        await expect(updateTransaction(db, "user1", result.outTx.id, {
            wallet_id: "w1",
            budget_id: null,
            type: "IN", // modified type from OUT to IN
            description: "Transfer of Funds",
            amount: 3000,
            transaction_date: "2026-06-17"
        })).rejects.toThrow("Cannot modify amount, wallet, or type of a transfer transaction");

        // Attempting to assign a budget category must reject
        await expect(updateTransaction(db, "user1", result.outTx.id, {
            wallet_id: "w1",
            budget_id: "b1", // modified from null to "b1"
            type: "OUT",
            description: "Transfer of Funds",
            amount: 3000,
            transaction_date: "2026-06-17"
        })).rejects.toThrow("Transfer transactions cannot be assigned to a budget category");
    });

    it("should synchronize description and date updates to both sides of a transfer", async () => {
        const result = await createTransfer(db, "user1", {
            source_wallet_id: "w1",
            destination_wallet_id: "w2",
            amount: 3000,
            transaction_date: "2026-06-17"
        });

        // Update description and date on outTx
        await updateTransaction(db, "user1", result.outTx.id, {
            wallet_id: "w1",
            budget_id: null,
            type: "OUT",
            description: "Uber ride",
            amount: 3000,
            transaction_date: "2026-06-18"
        });

        // Verify the IN transaction is updated as well
        const inTxResult = await db.select().from(transactions).where(eq(transactions.id, result.inTx.id)).limit(1);
        expect(inTxResult[0].description).toBe("Transfer of Funds");
        expect(inTxResult[0].transaction_date).toBe("2026-06-18");
    });

    it("should return transactions with joined wallet, budget, and linked_transaction objects", async () => {
        const transfer = await createTransfer(db, "user1", {
            source_wallet_id: "w1",
            destination_wallet_id: "w2",
            amount: 3000,
            transaction_date: "2026-06-17"
        });

        const { data } = await getAllTransactions(db, "user1", {});
        expect(data).toHaveLength(2);

        const outTx = data.find((t: any) => t.type === "OUT");
        expect(outTx).toBeDefined();
        expect(outTx.wallet).toEqual({ id: "w1", name: "Wallet A" });
        expect(outTx.budget).toBeNull();
        expect(outTx.linked_transaction).toEqual({
            id: transfer.inTx.id,
            wallet_id: "w2",
            wallet_name: "Wallet B"
        });

        const inTx = data.find((t: any) => t.type === "IN");
        expect(inTx).toBeDefined();
        expect(inTx.wallet).toEqual({ id: "w2", name: "Wallet B" });
        expect(inTx.linked_transaction).toEqual({
            id: transfer.outTx.id,
            wallet_id: "w1",
            wallet_name: "Wallet A"
        });
    });

    it("should filter transactions by TRANSFER, IN, or OUT types correctly", async () => {
        // 1. Create a regular transaction (IN / Income)
        await db.insert(transactions).values({
            id: "tx-inc",
            user_id: "user1",
            wallet_id: "w1",
            type: "IN",
            description: "Salary",
            amount: 5000,
            transaction_date: "2026-06-17",
            is_deleted: false
        });

        // 2. Create a transfer
        await createTransfer(db, "user1", {
            source_wallet_id: "w1",
            destination_wallet_id: "w2",
            amount: 1000,
            transaction_date: "2026-06-17"
        });

        // 3. Query TRANSFER transactions
        const transferResult = await getAllTransactions(db, "user1", { type: "TRANSFER" });
        expect(transferResult.data).toHaveLength(2); // OUT and IN sides of the transfer
        expect(transferResult.data.every((t: any) => t.linked_transaction_id !== null)).toBe(true);

        // 4. Query IN transactions
        const inResult = await getAllTransactions(db, "user1", { type: "IN" });
        expect(inResult.data).toHaveLength(1); // Salary only (not the IN side of the transfer)
        expect(inResult.data[0].id).toBe("tx-inc");

        // 5. Query OUT transactions
        const outResult = await getAllTransactions(db, "user1", { type: "OUT" });
        expect(outResult.data).toHaveLength(0); // 0 (regular expenses only)
    });

    it("should filter transactions by year_month correctly", async () => {
        // 1. Create a transaction in 2026-06
        await db.insert(transactions).values({
            id: "tx-jun",
            user_id: "user1",
            wallet_id: "w1",
            type: "IN",
            description: "June Salary",
            amount: 5000,
            transaction_date: "2026-06-15",
            is_deleted: false
        });

        // 2. Create a transaction in 2026-07
        await db.insert(transactions).values({
            id: "tx-jul",
            user_id: "user1",
            wallet_id: "w1",
            type: "IN",
            description: "July Salary",
            amount: 5500,
            transaction_date: "2026-07-02",
            is_deleted: false
        });

        // 3. Query transactions for 2026-06
        const junResult = await getAllTransactions(db, "user1", { year_month: "2026-06" });
        expect(junResult.data).toHaveLength(1);
        expect(junResult.data[0].id).toBe("tx-jun");

        // 4. Query transactions for 2026-07
        const julResult = await getAllTransactions(db, "user1", { year_month: "2026-07" });
        expect(julResult.data).toHaveLength(1);
        expect(julResult.data[0].id).toBe("tx-jul");
    });
});

// Helper to assert equality in tests since eq is imported from drizzle-orm
import { eq } from "drizzle-orm";
