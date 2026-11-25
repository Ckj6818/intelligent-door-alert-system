-- 已有库增量迁移：告警子类型 + 边缘参数
-- 可重复执行前请确认列不存在

ALTER TABLE `alert_log`
    ADD COLUMN `alert_type` VARCHAR(20) DEFAULT 'INTRUSION' COMMENT 'INTRUSION / TAILGATING / LOITERING / SPOOFING' AFTER `auth_status`,
    ADD COLUMN `handler` VARCHAR(50) DEFAULT NULL COMMENT '处置操作员' AFTER `status`,
    ADD COLUMN `handle_time` DATETIME DEFAULT NULL COMMENT '处置完成时间' AFTER `handler`,
    ADD COLUMN `handle_remark` VARCHAR(255) DEFAULT NULL COMMENT '处置结论与复核备注' AFTER `handle_time`;

ALTER TABLE `sys_device`
    ADD COLUMN `edge_config` TEXT DEFAULT NULL COMMENT '边缘算法参数 JSON' AFTER `status`;
