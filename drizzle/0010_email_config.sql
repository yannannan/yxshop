CREATE TABLE IF NOT EXISTS `email_config` (
  `id` integer PRIMARY KEY NOT NULL CHECK(`id`=1),
  `provider` text NOT NULL DEFAULT 'smtp',
  `from_address` text NOT NULL DEFAULT '',
  `smtp_host` text NOT NULL DEFAULT '',
  `smtp_port` integer NOT NULL DEFAULT 465,
  `smtp_security` text NOT NULL DEFAULT 'tls',
  `smtp_username` text NOT NULL DEFAULT '',
  `smtp_password` text NOT NULL DEFAULT '',
  `imap_host` text NOT NULL DEFAULT '',
  `imap_port` integer NOT NULL DEFAULT 993,
  `imap_security` text NOT NULL DEFAULT 'tls',
  `imap_username` text NOT NULL DEFAULT '',
  `imap_password` text NOT NULL DEFAULT '',
  `updated_at` text
);
--> statement-breakpoint
INSERT OR IGNORE INTO `email_config` (`id`) VALUES (1);
