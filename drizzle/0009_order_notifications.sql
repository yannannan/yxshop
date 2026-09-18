CREATE TABLE IF NOT EXISTS `notification_settings` (
  `type` text PRIMARY KEY NOT NULL,
  `recipient_emails` text NOT NULL DEFAULT '',
  `enabled` integer NOT NULL DEFAULT 1,
  `updated_at` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `order_notifications` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `order_id` text NOT NULL,
  `type` text NOT NULL,
  `recipient_email` text NOT NULL,
  `status` text NOT NULL DEFAULT 'pending',
  `error_message` text NOT NULL DEFAULT '',
  `created_at` text NOT NULL,
  `sent_at` text,
  UNIQUE(`order_id`,`type`,`recipient_email`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_order_notifications_order` ON `order_notifications` (`order_id`,`type`);
--> statement-breakpoint
INSERT OR IGNORE INTO `notification_settings` (`type`,`recipient_emails`,`enabled`) VALUES ('payment','',1), ('delivery','',1);
