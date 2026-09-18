ALTER TABLE `orders` ADD `recharge_json` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `sort_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `products` SET `sort_order`=`id` WHERE `sort_order`=0;--> statement-breakpoint
CREATE INDEX `idx_products_sort_order` ON `products` (`sort_order`);
