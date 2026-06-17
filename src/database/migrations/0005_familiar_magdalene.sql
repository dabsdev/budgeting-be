CREATE TABLE `recurring_reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`description` text NOT NULL,
	`amount` integer NOT NULL,
	`day_of_month` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`is_deleted` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_recurring_reminders_is_deleted` ON `recurring_reminders` (`is_deleted`);--> statement-breakpoint
CREATE INDEX `idx_recurring_reminders_is_active` ON `recurring_reminders` (`is_active`);--> statement-breakpoint
CREATE INDEX `idx_recurring_reminders_user_id` ON `recurring_reminders` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_recurring_reminders_description` ON `recurring_reminders` ("description" COLLATE NOCASE);