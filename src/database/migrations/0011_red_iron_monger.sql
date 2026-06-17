ALTER TABLE `recurring_reminders` ADD `wallet_id` text;--> statement-breakpoint
CREATE INDEX `idx_recurring_reminders_wallet_id` ON `recurring_reminders` (`wallet_id`);--> statement-breakpoint
ALTER TABLE `transactions` ADD `linked_reminder_id` text;--> statement-breakpoint
CREATE INDEX `idx_transaction_linked_reminder_id` ON `transactions` (`linked_reminder_id`);