-- 应用也会按工具自动补齐该字段；已有签名与手印库沿用原 deleted_at。
-- 只软删除成品，不更改完成状态、任务编号、积分或使用流水。
ALTER TABLE signed_documents ADD COLUMN deleted_at VARCHAR(40) NULL;
ALTER TABLE tool_generation_results ADD COLUMN deleted_at VARCHAR(40) NULL;
ALTER TABLE image_processing_results ADD COLUMN deleted_at VARCHAR(40) NULL;
ALTER TABLE video_extraction_tasks ADD COLUMN deleted_at VARCHAR(40) NULL;
