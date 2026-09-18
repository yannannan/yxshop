CREATE TABLE `credential_assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`credential_id` integer NOT NULL,
	`order_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`assigned_at` text NOT NULL,
	`released_at` text
);
--> statement-breakpoint
ALTER TABLE `credentials` ADD `email_auth_code` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `credentials` ADD `verification_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `credential_id` integer;--> statement-breakpoint
CREATE INDEX `idx_orders_credential_id` ON `orders` (`credential_id`);--> statement-breakpoint
CREATE INDEX `idx_credential_assignments_credential` ON `credential_assignments` (`credential_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_credential_assignments_order` ON `credential_assignments` (`order_id`,`status`);--> statement-breakpoint
INSERT INTO `credential_assignments` (`credential_id`,`order_id`,`user_id`,`status`,`assigned_at`)
SELECT `credential_id`,`id`,`user_id`,'active',COALESCE(`delivered_at`,`updated_at`,`created_at`)
FROM `orders`
WHERE `credential_id` IS NOT NULL;
