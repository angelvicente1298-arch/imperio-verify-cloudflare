CREATE TABLE `panel_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(64) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`label` varchar(96),
	`role` enum('owner','moderator') NOT NULL DEFAULT 'moderator',
	`active` boolean NOT NULL DEFAULT true,
	`createdBy` varchar(64),
	`lastLoginAt` timestamp,
	`loginCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `panel_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `panel_accounts_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `panel_logins` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(64) NOT NULL,
	`ok` boolean NOT NULL DEFAULT false,
	`ip` varchar(64),
	`country` varchar(8),
	`userAgent` varchar(255),
	`reason` varchar(160),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `panel_logins_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_panel_accounts_active` ON `panel_accounts` (`active`);--> statement-breakpoint
CREATE INDEX `idx_panel_logins_username` ON `panel_logins` (`username`);--> statement-breakpoint
CREATE INDEX `idx_panel_logins_created_at` ON `panel_logins` (`createdAt`);