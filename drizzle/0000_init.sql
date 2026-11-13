CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`opening_balance` integer DEFAULT 0 NOT NULL,
	`opening_date` text NOT NULL,
	`currency` text NOT NULL,
	`color` text NOT NULL,
	`icon` text NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`credit_limit` integer,
	`statement_day` integer,
	`due_day` integer,
	`last4` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `accounts_type_idx` ON `accounts` (`type`);--> statement-breakpoint
CREATE TABLE `alert_log` (
	`key` text PRIMARY KEY NOT NULL,
	`fired_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `budget_categories` (
	`budget_id` text NOT NULL,
	`category_id` text NOT NULL,
	PRIMARY KEY(`budget_id`, `category_id`),
	FOREIGN KEY (`budget_id`) REFERENCES `budgets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`series_id` text NOT NULL,
	`name` text NOT NULL,
	`period` text NOT NULL,
	`limit_amount` integer NOT NULL,
	`recurring` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `budgets_period_idx` ON `budgets` (`period`);--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_series_period_idx` ON `budgets` (`series_id`,`period`);--> statement-breakpoint
CREATE TABLE `card_statements` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`statement_date` text NOT NULL,
	`minimum_due` integer,
	`stated_total` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `card_statements_account_date_idx` ON `card_statements` (`account_id`,`statement_date`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`icon` text NOT NULL,
	`color` text NOT NULL,
	`parent_id` text,
	`archived` integer DEFAULT false NOT NULL,
	`system_key` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `categories_parent_idx` ON `categories` (`parent_id`);--> statement-breakpoint
CREATE TABLE `category_keywords` (
	`id` text PRIMARY KEY NOT NULL,
	`keyword` text NOT NULL,
	`category_id` text NOT NULL,
	`origin` text DEFAULT 'user' NOT NULL,
	`hits` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `category_keywords_keyword_idx` ON `category_keywords` (`keyword`);--> statement-breakpoint
CREATE TABLE `goal_contributions` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_id` text NOT NULL,
	`amount` integer NOT NULL,
	`day` text NOT NULL,
	`note` text,
	`transaction_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `goal_contrib_goal_idx` ON `goal_contributions` (`goal_id`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`target_amount` integer NOT NULL,
	`target_date` text,
	`account_id` text,
	`color` text NOT NULL,
	`icon` text NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `planned_purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`estimated_price` integer NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`funding_notes` text,
	`status` text DEFAULT 'thinking' NOT NULL,
	`transaction_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `reconciliations` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`day` text NOT NULL,
	`stated_balance` integer NOT NULL,
	`computed_balance` integer NOT NULL,
	`adjustment_transaction_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reconciliations_account_idx` ON `reconciliations` (`account_id`,`day`);--> statement-breakpoint
CREATE TABLE `recurring_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`amount` integer NOT NULL,
	`account_id` text NOT NULL,
	`to_account_id` text,
	`category_id` text,
	`method` text,
	`frequency` text NOT NULL,
	`interval` integer DEFAULT 1 NOT NULL,
	`anchor_day` integer,
	`next_date` text NOT NULL,
	`end_date` text,
	`mode` text DEFAULT 'remind' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`to_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sms_account_map` (
	`last4` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sms_inbox` (
	`id` text PRIMARY KEY NOT NULL,
	`hash` text NOT NULL,
	`direction` text NOT NULL,
	`amount` integer NOT NULL,
	`last4` text,
	`merchant` text,
	`method` text,
	`instrument` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`day` text NOT NULL,
	`balance` integer,
	`sender` text,
	`pattern_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`account_id` text,
	`category_id` text,
	`transaction_id` text,
	`possible_duplicate_of` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sms_inbox_hash_idx` ON `sms_inbox` (`hash`);--> statement-breakpoint
CREATE INDEX `sms_inbox_status_idx` ON `sms_inbox` (`status`,`day`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`amount` integer NOT NULL,
	`occurred_at` integer NOT NULL,
	`day` text NOT NULL,
	`account_id` text NOT NULL,
	`to_account_id` text,
	`category_id` text,
	`payee` text,
	`method` text,
	`note` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'cleared' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`sms_hash` text,
	`recurring_rule_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`to_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `tx_day_idx` ON `transactions` (`day`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `tx_account_day_idx` ON `transactions` (`account_id`,`day`);--> statement-breakpoint
CREATE INDEX `tx_to_account_day_idx` ON `transactions` (`to_account_id`,`day`);--> statement-breakpoint
CREATE INDEX `tx_category_day_idx` ON `transactions` (`category_id`,`day`);--> statement-breakpoint
CREATE INDEX `tx_status_day_idx` ON `transactions` (`status`,`day`);--> statement-breakpoint
CREATE INDEX `tx_amount_idx` ON `transactions` (`amount`);--> statement-breakpoint
CREATE UNIQUE INDEX `tx_sms_hash_idx` ON `transactions` (`sms_hash`);