ALTER TABLE `credentials` ADD `account` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `credentials` ADD `password` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `credentials` ADD `cost_price` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `credentials` ADD `sale_price` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `cost_price` real DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `credentials` SET `account`=`content` WHERE `account`='' AND `content`<>'';--> statement-breakpoint
UPDATE `credentials` SET `sale_price`=COALESCE((SELECT `price` FROM `products` WHERE `products`.`id`=`credentials`.`product_id`),0) WHERE `sale_price`=0;
