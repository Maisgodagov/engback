-- Add FULLTEXT index to transcriptFull column for faster phrase search
ALTER TABLE `video_learning_content` ADD FULLTEXT INDEX `idx_transcript_full_fulltext` (`transcript_full`);
