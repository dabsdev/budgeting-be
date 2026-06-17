import { Bindings } from "../../config/env";
import { db } from "../../config/db";
import { recurringReminders } from "./recurring-reminder.table";
import { wallets } from "../wallet/wallet.table";
import { users } from "../user/user.table";
import { transactions } from "../transaction/transaction.table";
import { and, eq, like, sql } from "drizzle-orm";
import { sendEmail } from "../../lib/email";

/**
 * Memproses seluruh pengingat transaksi berulang bulanan yang jatuh tempo pada tanggal berjalan.
 * Fungsi ini mengeksekusi debet otomatis (jika saldo cukup) dan mengirimkan notifikasi email (sukses/gagal).
 * 
 * @param env Konfigurasi bindings Cloudflare Worker.
 * @param dateOverride Opsional Date untuk mensimulasikan tanggal tertentu pada unit test.
 */
export const processRecurringReminders = async (env: Bindings, dateOverride?: Date) => {
    const database = db(env.DB);
    const today = dateOverride || new Date();
    
    // Dapatkan tanggal hari ini (UTC)
    const currentDay = today.getUTCDate();
    const currentMonthYear = today.toISOString().substring(0, 7); // Format: YYYY-MM
    const currentFullDate = today.toISOString().substring(0, 10); // Format: YYYY-MM-DD

    // Deteksi apakah hari ini adalah hari terakhir dari bulan berjalan
    const year = today.getUTCFullYear();
    const month = today.getUTCMonth();
    const tomorrow = new Date(Date.UTC(year, month, currentDay + 1));
    const isLastDayOfMonth = tomorrow.getUTCMonth() !== month;

    // Ambil semua pengingat berulang yang aktif dan belum dihapus
    const activeReminders = await database
        .select()
        .from(recurringReminders)
        .where(
            and(
                eq(recurringReminders.is_active, true),
                eq(recurringReminders.is_deleted, false)
            )
        );

    // Filter pengingat yang jatuh tempo hari ini
    const dueReminders = activeReminders.filter((reminder) => {
        if (isLastDayOfMonth) {
            // Jika akhir bulan, proses semua reminder yang tanggalnya hari ini ATAU lebih besar (misal 29, 30, 31 di bulan Februari)
            return reminder.day_of_month >= currentDay;
        } else {
            // Jika hari biasa, hanya proses yang tanggalnya pas hari ini
            return reminder.day_of_month === currentDay;
        }
    });

    for (const reminder of dueReminders) {
        try {
            // 1. Cek apakah pengingat ini sudah pernah diproses di bulan berjalan (Pencegahan double-billing)
            const existingTx = await database
                .select()
                .from(transactions)
                .where(
                    and(
                        eq(transactions.linked_reminder_id, reminder.id),
                        eq(transactions.is_deleted, false),
                        like(transactions.transaction_date, `${currentMonthYear}-%`)
                    )
                )
                .limit(1);

            if (existingTx.length > 0) {
                // Sudah pernah diproses bulan ini, lewati
                continue;
            }

            // 2. Ambil detail user dan dompet terkait
            const details = await database
                .select({
                    userEmail: users.email,
                    userName: users.name,
                    walletBalance: wallets.balance,
                    walletName: wallets.name
                })
                .from(recurringReminders)
                .innerJoin(users, eq(users.id, recurringReminders.user_id))
                .innerJoin(wallets, eq(wallets.id, recurringReminders.wallet_id))
                .where(eq(recurringReminders.id, reminder.id))
                .limit(1);

            if (details.length === 0) {
                // User atau wallet tidak ditemukan (mungkin sudah terhapus), lewati
                continue;
            }

            const { userEmail, userName, walletBalance, walletName } = details[0];
            const balanceNum = Number(walletBalance) || 0;

            // 3. Validasi kecukupan saldo dompet
            if (balanceNum >= reminder.amount) {
                // --- KASUS A: SALDO CUKUP (Auto-Generate Transaksi & Mutasi Saldo) ---
                
                await database.batch([
                    database
                        .update(wallets)
                        .set({
                            balance: sql`CAST(CAST(balance AS REAL) - ${reminder.amount} AS TEXT)`,
                            updated_at: sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
                        })
                        .where(eq(wallets.id, reminder.wallet_id!)),
                    database.insert(transactions).values({
                        id: crypto.randomUUID(),
                        user_id: reminder.user_id,
                        wallet_id: reminder.wallet_id!,
                        budget_id: null,
                        type: "OUT",
                        description: `[Auto-Debit] ${reminder.description}`,
                        amount: reminder.amount,
                        transaction_date: currentFullDate,
                        linked_reminder_id: reminder.id,
                        is_deleted: false
                    })
                ]);

                // Kirim email notifikasi sukses via Resend API
                try {
                    await sendEmail(env, {
                        to: userEmail,
                        subject: `Pembayaran Otomatis Berhasil: ${reminder.description}`,
                        html: `
                            <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 5px;">
                                <h2 style="color: #4caf50;">Pembayaran Otomatis Berhasil</h2>
                                <p>Halo <strong>${userName}</strong>,</p>
                                <p>Kami menginformasikan bahwa pembayaran otomatis untuk tagihan/pengingat Anda telah berhasil didebet:</p>
                                <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                                    <tr>
                                        <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Deskripsi:</strong></td>
                                        <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${reminder.description}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Jumlah:</strong></td>
                                        <td style="padding: 8px 0; border-bottom: 1px solid #eee;">Rp ${reminder.amount.toLocaleString("id-ID")}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Sumber Dana:</strong></td>
                                        <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${walletName}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Tanggal:</strong></td>
                                        <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${currentFullDate}</td>
                                    </tr>
                                </table>
                                <p style="color: #666; font-size: 14px;">Saldo dompet Anda telah diperbarui secara otomatis. Terima kasih telah menggunakan layanan kami.</p>
                            </div>
                        `
                    });
                } catch (emailErr) {
                    console.error(`Gagal mengirim email sukses untuk reminder ${reminder.id}:`, emailErr);
                }

            } else {
                // --- KASUS B: SALDO TIDAK CUKUP (Batalkan Transaksi & Kirim Notifikasi Gagal) ---
                
                try {
                    await sendEmail(env, {
                        to: userEmail,
                        subject: `⚠️ PERHATIAN: Pembayaran Otomatis GAGAL - ${reminder.description}`,
                        html: `
                            <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 5px;">
                                <h2 style="color: #f44336;">⚠️ Pembayaran Otomatis Gagal</h2>
                                <p>Halo <strong>${userName}</strong>,</p>
                                <p>Kami menginformasikan bahwa pembayaran otomatis untuk tagihan/pengingat Anda <strong>GAGAL</strong> didebet karena saldo dompet Anda tidak mencukupi:</p>
                                <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                                    <tr>
                                        <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Deskripsi Tagihan:</strong></td>
                                        <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${reminder.description}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Jumlah Tagihan:</strong></td>
                                        <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #f44336;"><strong>Rp ${reminder.amount.toLocaleString("id-ID")}</strong></td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Dompet Sumber:</strong></td>
                                        <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${walletName}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Saldo Dompet Saat Ini:</strong></td>
                                        <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #f44336;">Rp ${balanceNum.toLocaleString("id-ID")}</td>
                                    </tr>
                                </table>
                                <p style="color: #f44336; font-weight: bold;">Tindakan Diperlukan:</p>
                                <p>Silakan lakukan pengisian saldo (top-up) pada dompet <strong>${walletName}</strong> Anda sebesar minimal Rp ${(reminder.amount - balanceNum).toLocaleString("id-ID")} agar tagihan bulanan Anda dapat tercatat dengan benar, atau lakukan pencatatan transaksi manual.</p>
                            </div>
                        `
                    });
                } catch (emailErr) {
                    console.error(`Gagal mengirim email kegagalan untuk reminder ${reminder.id}:`, emailErr);
                }
            }
        } catch (err) {
            console.error(`Gagal memproses pengingat berulang ID ${reminder.id}:`, err);
        }
    }
};
