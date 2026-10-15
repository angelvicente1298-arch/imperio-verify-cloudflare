CREATE TABLE `bot_actions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`action` varchar(64) NOT NULL,
	`target` varchar(96),
	`detail` text,
	`ok` boolean NOT NULL DEFAULT true,
	`error` varchar(255),
	`createdBy` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bot_actions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bot_blocks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`discordId` varchar(32) NOT NULL,
	`username` varchar(64),
	`kind` enum('block','allow') NOT NULL DEFAULT 'block',
	`reason` varchar(255),
	`createdBy` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bot_blocks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bot_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(64) NOT NULL,
	`value` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bot_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `bot_settings_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE INDEX `idx_bot_actions_action` ON `bot_actions` (`action`);--> statement-breakpoint
CREATE INDEX `idx_bot_actions_created_at` ON `bot_actions` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_bot_blocks_discord_id` ON `bot_blocks` (`discordId`);--> statement-breakpoint
CREATE INDEX `idx_bot_blocks_kind` ON `bot_blocks` (`kind`);