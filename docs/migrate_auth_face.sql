-- ============================================================
-- 增量迁移：授权人员白名单 + 告警人脸字段 + 通行日志
-- 适用于已存在的 intelligent_door_alert 库
-- 若列已存在会报错，可忽略对应语句后继续执行后续 CREATE
-- ============================================================

USE `intelligent_door_alert`;

-- 1) 告警表扩充人脸比对字段
ALTER TABLE `alert_log`
    ADD COLUMN `auth_status` VARCHAR(20) DEFAULT NULL COMMENT 'AUTHORIZED / UNAUTHORIZED' AFTER `danger_level`;

ALTER TABLE `alert_log`
    ADD COLUMN `recognized_name` VARCHAR(100) DEFAULT NULL COMMENT '识别到的姓名' AFTER `auth_status`;

-- 2) 授权人员白名单
CREATE TABLE IF NOT EXISTS `sys_authorized_user` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `user_code`   VARCHAR(50)  NOT NULL                COMMENT '工号',
    `name`        VARCHAR(50)  NOT NULL                COMMENT '姓名',
    `department`  VARCHAR(100) DEFAULT NULL            COMMENT '部门',
    `avatar_url`  VARCHAR(500) DEFAULT NULL            COMMENT '人脸照片路径',
    `status`      TINYINT      NOT NULL DEFAULT 1      COMMENT '1-启用 / 0-禁用',
    `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_user_code` (`user_code`),
    KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='授权人员白名单';

-- 3) 授权通行日志（AUTHORIZED）
CREATE TABLE IF NOT EXISTS `passage_log` (
    `id`              BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `device_id`       BIGINT        NOT NULL                COMMENT '关联设备ID',
    `recognized_name` VARCHAR(100)  DEFAULT NULL            COMMENT '识别姓名',
    `auth_status`     VARCHAR(20)   NOT NULL DEFAULT 'AUTHORIZED' COMMENT '授权状态',
    `proximity_ratio` DOUBLE        NOT NULL DEFAULT 0      COMMENT '面积占比 / 接近度',
    `image_url`       VARCHAR(500)  DEFAULT NULL            COMMENT '抓拍图片URL',
    `create_time`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '通行时间',
    PRIMARY KEY (`id`),
    KEY `idx_device_id` (`device_id`),
    KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='授权通行日志';
