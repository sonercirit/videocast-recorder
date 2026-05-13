ALTER TABLE `recordings` ADD `recording_session_id` text;--> statement-breakpoint
ALTER TABLE `recordings` ADD `sync_started_at` integer;--> statement-breakpoint
ALTER TABLE `recordings` ADD `sync_stopped_at` integer;--> statement-breakpoint
CREATE INDEX `recordings_session_idx` ON `recordings` (`room_id`,`recording_session_id`);