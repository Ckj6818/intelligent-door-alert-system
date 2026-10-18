-- 已有库增量迁移：告警子类型 + 边缘参数
-- 可重复执行前请确认列不存在

ALTER TABLE `alert_log`
    ADD COLUMN `alert_type` VARCHAR(20) DEFAULT 'INTRUSION' COMMENT 'INTRUSION / TAILGATING / LOITERING' AFTER `auth_status`;

ALTER TABLE `sys_device`
    ADD COLUMN `edge_config` TEXT DEFAULT NULL COMMENT '边缘算法参数 JSON' AFTER `status`;
