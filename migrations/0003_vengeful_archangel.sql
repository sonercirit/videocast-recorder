CREATE TABLE `room_bans` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`user_id` text NOT NULL,
	`banned_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`banned_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_bans_room_user_unique` ON `room_bans` (`room_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `room_bans_room_id_idx` ON `room_bans` (`room_id`);--> statement-breakpoint
CREATE INDEX `room_bans_user_id_idx` ON `room_bans` (`user_id`);