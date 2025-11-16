CREATE TABLE `video_transcript_tokens` (
    `content_id` INTEGER NOT NULL,
    `position` INTEGER NOT NULL,
    `token` VARCHAR(128) NOT NULL,
    `token_normalized` VARCHAR(128) NOT NULL,
    `start_seconds` DOUBLE NULL,
    `end_seconds` DOUBLE NULL,
    PRIMARY KEY (`content_id`, `position`),
    CONSTRAINT `video_transcript_tokens_content_id_fkey`
      FOREIGN KEY (`content_id`) REFERENCES `video_learning_content`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX `idx_video_transcript_token_search`
  ON `video_transcript_tokens` (`token_normalized`, `content_id`, `position`);
