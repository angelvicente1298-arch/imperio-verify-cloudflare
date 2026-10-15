CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
CREATE TABLE `verification_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`verificationId` int,
	`discordId` varchar(32),
	`type` varchar(32) NOT NULL,
	`message` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `verification_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `verifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticket` varchar(24) NOT NULL,
	`discordId` varchar(32),
	`username` varchar(64),
	`globalName` varchar(96),
	`avatar` varchar(160),
	`email` varchar(320),
	`accountCreatedAt` timestamp,
	`accountAgeDays` int,
	`status` enum('pending','approved','blocked','error') NOT NULL DEFAULT 'pending',
	`decision` enum('allow','block') NOT NULL DEFAULT 'block',
	`riskScore` int NOT NULL DEFAULT 0,
	`reasons` text,
	`errorMessage` varchar(255),
	`ip` varchar(64),
	`ipCountry` varchar(8),
	`ipCity` varchar(96),
	`ipIsp` varchar(128),
	`ipTimezone` varchar(64),
	`ipProxy` boolean NOT NULL DEFAULT false,
	`ipHosting` boolean NOT NULL DEFAULT false,
	`vpnDetected` boolean NOT NULL DEFAULT false,
	`privateIp` boolean NOT NULL DEFAULT false,
	`clientTimezone` varchar(64),
	`fingerprint` varchar(64),
	`userAgent` varchar(255),
	`sameIpAccounts` int NOT NULL DEFAULT 0,
	`sameFingerprintAccounts` int NOT NULL DEFAULT 0,
	`guildJoined` boolean NOT NULL DEFAULT false,
	`roleGranted` boolean NOT NULL DEFAULT false,
	`demo` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `verifications_id` PRIMARY KEY(`id`),
	CONSTRAINT `verifications_ticket_unique` UNIQUE(`ticket`)
);
--> statement-breakpoint
CREATE INDEX `idx_verifications_ip` ON `verifications` (`ip`);--> statement-breakpoint
CREATE INDEX `idx_verifications_fingerprint` ON `verifications` (`fingerprint`);--> statement-breakpoint
CREATE INDEX `idx_verifications_discord_id` ON `verifications` (`discordId`);--> statement-breakpoint
CREATE INDEX `idx_verifications_status` ON `verifications` (`status`);--> statement-breakpoint
CREATE INDEX `idx_verifications_created_at` ON `verifications` (`createdAt`);