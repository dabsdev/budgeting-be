import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { db as connectDb } from "../src/config/db";
import { wallets } from "../src/features/wallet/wallet.table";
import { users } from "../src/features/user/user.table";
import { recurringReminders } from "../src/features/recurring-reminder/recurring-reminder.table";
import { transactions } from "../src/features/transaction/transaction.table";
import { processRecurringReminders } from "../src/features/recurring-reminder/cron.service";
import { eq, and } from "drizzle-orm";

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
    for (const sqlStr of migrations) {
        const statements = sqlStr.split("--> statement-breakpoint");
        for (const statement of statements) {
            const trimmed = statement.trim();
            if (trimmed) {
                const singleLineSql = trimmed.replace(/\s+/g, " ");
                await d1.exec(singleLineSql);
            }
        }
    }
};

describe("Cronjob Transaksi Berulang Unit Tests", () => {
    let db: any;
    let fetchMock: any;

    beforeEach(async () => {
        // Reset database lokal testing
        await applyMigrations(env.DB);
        db = connectDb(env.DB);

        // Bersihkan data lama jika ada
        await db.delete(transactions);
        await db.delete(recurringReminders);
        await db.delete(wallets);
        await db.delete(users);

        // Mock global fetch untuk memotong koneksi luar ke Resend API
        fetchMock = vi.fn().mockImplementation(() => {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ id: "email-id-mock" }),
                text: () => Promise.resolve("OK")
            });
        });
        vi.stubGlobal("fetch", fetchMock);

        // Seed data dasar user
        await db.insert(users).values({
            id: "user1",
            name: "Daffa Abdillah",
            email: "daffa@example.com",
            phone_number: "081234567890",
            password: "hashedpassword123"
        });

        // Seed wallets
        await db.insert(wallets).values({
            id: "w_cukup",
            user_id: "user1",
            name: "Dompet Kaya",
            balance: "1000000", // Saldo melimpah
            is_deleted: false
        });

        await db.insert(wallets).values({
            id: "w_miskin",
            user_id: "user1",
            name: "Dompet Kering",
            balance: "5000", // Saldo tipis
            is_deleted: false
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("harus berhasil mendebet otomatis dan membuat transaksi OUT jika saldo cukup", async () => {
        // Buat pengingat berulang jatuh tempo tanggal 17
        await db.insert(recurringReminders).values({
            id: "rem_1",
            user_id: "user1",
            wallet_id: "w_cukup",
            description: "Langganan Cloudflare",
            amount: 75000,
            day_of_month: 17,
            is_active: true,
            is_deleted: false
        });

        // Simulasikan hari ini tanggal 17 Juni 2026
        const testDate = new Date(Date.UTC(2026, 5, 17, 10, 0, 0)); // Bulan Juni (5 dalam JS Date)

        await processRecurringReminders(env, testDate);

        // 1. Verifikasi saldo dompet berkurang
        const walletResult = await db.select().from(wallets).where(eq(wallets.id, "w_cukup")).limit(1);
        expect(Number(walletResult[0].balance)).toBe(925000); // 1.000.000 - 75.000

        // 2. Verifikasi transaksi OUT terbuat
        const txResult = await db.select().from(transactions).where(eq(transactions.linked_reminder_id, "rem_1"));
        expect(txResult).toHaveLength(1);
        expect(txResult[0].type).toBe("OUT");
        expect(txResult[0].amount).toBe(75000);
        expect(txResult[0].description).toBe("[Auto-Debit] Langganan Cloudflare");

        // 3. Verifikasi email sukses terkirim ke Resend
        expect(fetchMock).toHaveBeenCalled();
        const fetchArgs = fetchMock.mock.calls[0];
        expect(fetchArgs[0]).toBe("https://api.resend.com/emails");
        const bodyObj = JSON.parse(fetchArgs[1].body);
        expect(bodyObj.to[0]).toBe("daffa@example.com");
        expect(bodyObj.subject).toContain("Pembayaran Otomatis Berhasil");
    });

    it("harus gagal mendebet dan mengirim email kegagalan jika saldo dompet tidak cukup", async () => {
        // Buat pengingat berulang jatuh tempo tanggal 17
        await db.insert(recurringReminders).values({
            id: "rem_2",
            user_id: "user1",
            wallet_id: "w_miskin",
            description: "Bayar Server Hosting",
            amount: 50000, // melebihi saldo dompet w_miskin (5000)
            day_of_month: 17,
            is_active: true,
            is_deleted: false
        });

        const testDate = new Date(Date.UTC(2026, 5, 17, 10, 0, 0));

        await processRecurringReminders(env, testDate);

        // 1. Saldo dompet harus tetap utuh
        const walletResult = await db.select().from(wallets).where(eq(wallets.id, "w_miskin")).limit(1);
        expect(Number(walletResult[0].balance)).toBe(5000);

        // 2. Transaksi OUT tidak boleh terbuat
        const txResult = await db.select().from(transactions).where(eq(transactions.linked_reminder_id, "rem_2"));
        expect(txResult).toHaveLength(0);

        // 3. Email kegagalan harus terkirim
        expect(fetchMock).toHaveBeenCalled();
        const fetchArgs = fetchMock.mock.calls[0];
        const bodyObj = JSON.parse(fetchArgs[1].body);
        expect(bodyObj.subject).toContain("Pembayaran Otomatis GAGAL");
        expect(bodyObj.html).toContain("saldo dompet Anda tidak mencukupi");
    });

    it("harus menangani edge case akhir bulan dengan memproses reminder tanggal 29, 30, 31 pada hari terakhir bulan berjalan", async () => {
        // Di bulan Februari 2026 (berakhir di tanggal 28)
        // Kita seed reminder tanggal 28, 29, dan 30
        await db.insert(recurringReminders).values([
            { id: "rem_feb_28", user_id: "user1", wallet_id: "w_cukup", description: "Reminder 28", amount: 1000, day_of_month: 28, is_active: true, is_deleted: false },
            { id: "rem_feb_29", user_id: "user1", wallet_id: "w_cukup", description: "Reminder 29", amount: 1000, day_of_month: 29, is_active: true, is_deleted: false },
            { id: "rem_feb_30", user_id: "user1", wallet_id: "w_cukup", description: "Reminder 30", amount: 1000, day_of_month: 30, is_active: true, is_deleted: false }
        ]);

        // Simulasikan hari terakhir Februari (28 Februari 2026)
        const testDate = new Date(Date.UTC(2026, 1, 28, 10, 0, 0)); // 1 = Februari

        await processRecurringReminders(env, testDate);

        // Semua reminder (28, 29, 30) harus diproses pada tanggal 28 Februari karena merupakan akhir bulan
        const txs = await db.select().from(transactions);
        expect(txs).toHaveLength(3);
        const descriptions = txs.map((t: any) => t.description).sort();
        expect(descriptions).toEqual([
            "[Auto-Debit] Reminder 28",
            "[Auto-Debit] Reminder 29",
            "[Auto-Debit] Reminder 30"
        ]);
    });

    it("harus mencegah pemrosesan ganda (double-billing) jika cronjob terpicu lebih dari satu kali di hari yang sama", async () => {
        await db.insert(recurringReminders).values({
            id: "rem_double",
            user_id: "user1",
            wallet_id: "w_cukup",
            description: "Gaji Asisten",
            amount: 10000,
            day_of_month: 17,
            is_active: true,
            is_deleted: false
        });

        const testDate = new Date(Date.UTC(2026, 5, 17, 10, 0, 0));

        // Pemicuan ke-1
        await processRecurringReminders(env, testDate);

        // Pemicuan ke-2 (di hari yang sama)
        await processRecurringReminders(env, testDate);

        // Transaksi terbuat hanya 1 kali
        const txResult = await db.select().from(transactions).where(eq(transactions.linked_reminder_id, "rem_double"));
        expect(txResult).toHaveLength(1);

        // Saldo dompet hanya terpotong 1 kali
        const walletResult = await db.select().from(wallets).where(eq(wallets.id, "w_cukup")).limit(1);
        expect(Number(walletResult[0].balance)).toBe(990000); // 1.000.000 - 10.000
    });
});
