CREATE TABLE `recording_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`recording_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`r2_key` text NOT NULL,
	`byte_length` integer NOT NULL,
	`uploaded_at` integer NOT NULL,
	FOREIGN KEY (`recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recording_chunks_recording_index_unique` ON `recording_chunks` (`recording_id`,`chunk_index`);--> statement-breakpoint
CREATE INDEX `recording_chunks_recording_id_idx` ON `recording_chunks` (`recording_id`);--> statement-breakpoint
CREATE TABLE `recordings` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`user_id` text NOT NULL,
	`quality` text NOT NULL,
	`mime_type` text NOT NULL,
	`status` text DEFAULT 'recording' NOT NULL,
	`r2_prefix` text NOT NULL,
	`chunk_count` integer DEFAULT 0 NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recordings_room_id_idx` ON `recordings` (`room_id`);--> statement-breakpoint
CREATE INDEX `recordings_user_id_idx` ON `recordings` (`user_id`);--> statement-breakpoint
CREATE INDEX `recordings_status_idx` ON `recordings` (`status`);--> statement-breakpoint
CREATE TABLE `room_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`joined_at` integer NOT NULL,
	`left_at` integer,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `room_participants_room_id_idx` ON `room_participants` (`room_id`);--> statement-breakpoint
CREATE INDEX `room_participants_user_id_idx` ON `room_participants` (`user_id`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`is_open` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_slug_unique` ON `rooms` (`slug`);--> statement-breakpoint
CREATE INDEX `rooms_owner_user_id_idx` ON `rooms` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `rooms_created_at_idx` ON `rooms` (`created_at`);--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);