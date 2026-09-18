ALTER TABLE `credential_assignments` ADD `product_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `credential_assignments` ADD `category` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `credential_assignments` ADD `subcategory` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `credential_assignments` ADD `billing_cycle` text DEFAULT 'once' NOT NULL;--> statement-breakpoint
UPDATE `credential_assignments`
SET
  `product_name`=COALESCE(NULLIF(`product_name`,''),(SELECT p.`name` FROM `orders` o JOIN `products` p ON p.`id`=o.`product_id` WHERE o.`id`=`credential_assignments`.`order_id`),(SELECT p.`name` FROM `credentials` c JOIN `products` p ON p.`id`=c.`product_id` WHERE c.`id`=`credential_assignments`.`credential_id`),''),
  `category`=COALESCE(NULLIF(`category`,''),(SELECT p.`category` FROM `orders` o JOIN `products` p ON p.`id`=o.`product_id` WHERE o.`id`=`credential_assignments`.`order_id`),(SELECT p.`category` FROM `credentials` c JOIN `products` p ON p.`id`=c.`product_id` WHERE c.`id`=`credential_assignments`.`credential_id`),''),
  `subcategory`=COALESCE(NULLIF(`subcategory`,''),(SELECT p.`subcategory` FROM `orders` o JOIN `products` p ON p.`id`=o.`product_id` WHERE o.`id`=`credential_assignments`.`order_id`),(SELECT p.`subcategory` FROM `credentials` c JOIN `products` p ON p.`id`=c.`product_id` WHERE c.`id`=`credential_assignments`.`credential_id`),''),
  `billing_cycle`=COALESCE(NULLIF(`billing_cycle`,''),(SELECT p.`billing_cycle` FROM `orders` o JOIN `products` p ON p.`id`=o.`product_id` WHERE o.`id`=`credential_assignments`.`order_id`),(SELECT p.`billing_cycle` FROM `credentials` c JOIN `products` p ON p.`id`=c.`product_id` WHERE c.`id`=`credential_assignments`.`credential_id`),'once');
--> statement-breakpoint
UPDATE `credential_assignments`
SET `billing_cycle`=COALESCE((SELECT p.`billing_cycle` FROM `orders` o JOIN `products` p ON p.`id`=o.`product_id` WHERE o.`id`=`credential_assignments`.`order_id`),(SELECT p.`billing_cycle` FROM `credentials` c JOIN `products` p ON p.`id`=c.`product_id` WHERE c.`id`=`credential_assignments`.`credential_id`),'once')
WHERE `billing_cycle`='once' AND COALESCE((SELECT p.`billing_cycle` FROM `orders` o JOIN `products` p ON p.`id`=o.`product_id` WHERE o.`id`=`credential_assignments`.`order_id`),(SELECT p.`billing_cycle` FROM `credentials` c JOIN `products` p ON p.`id`=c.`product_id` WHERE c.`id`=`credential_assignments`.`credential_id`),'once')<>'once';
