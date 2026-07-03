-- ============================================================
-- 智能门禁安防系统 - 数据库初始化脚本
-- 数据库: intelligent_door_alert
-- 字符集: utf8mb4
-- 适用于: MySQL 8.0+
-- ============================================================

CREATE DATABASE IF NOT EXISTS `intelligent_door_alert`
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_general_ci;

USE `intelligent_door_alert`;

-- -----------------------------------------------------------
-- 1. 系统用户表
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `sys_user`;
CREATE TABLE `sys_user` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `username`    VARCHAR(50)  NOT NULL                COMMENT '登录账号',
    `password`    VARCHAR(100) NOT NULL                COMMENT '登录密码（密文）',
    `nickname`    VARCHAR(50)  DEFAULT NULL            COMMENT '用户昵称',
    `role`        VARCHAR(20)  NOT NULL DEFAULT 'user' COMMENT '角色（admin-管理员, user-普通用户）',
    `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='系统用户表';

-- -----------------------------------------------------------
-- 2. 设备信息表
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `sys_device`;
CREATE TABLE `sys_device` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `device_name` VARCHAR(100) NOT NULL                COMMENT '设备名称',
    `location`    VARCHAR(200) DEFAULT NULL            COMMENT '设备安装位置',
    `status`      TINYINT      NOT NULL DEFAULT 0      COMMENT '设备状态（0-离线, 1-在线）',
    `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='设备信息表';

-- -----------------------------------------------------------
-- 3. 告警日志表
-- -----------------------------------------------------------
DROP TABLE IF EXISTS `alert_log`;
CREATE TABLE `alert_log` (
    `id`              BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `device_id`       BIGINT        NOT NULL                COMMENT '关联设备ID',
    `image_url`       VARCHAR(500)  DEFAULT NULL            COMMENT '告警抓拍图片URL',
    `proximity_ratio` DOUBLE        NOT NULL DEFAULT 0      COMMENT '目标接近度（0~1 浮点数）',
    `danger_level`    INT           NOT NULL DEFAULT 0      COMMENT '危险等级（0-安全, 1-注意, 2-警告, 3-危险）',
    `status`          TINYINT       NOT NULL DEFAULT 0      COMMENT '处理状态（0-未处理, 1-已处理）',
    `create_time`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`id`),
    KEY `idx_device_id` (`device_id`),
    KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='告警日志表';

-- ============================================================
-- 基础测试数据
-- ============================================================

-- 管理员账号（密码: admin123）
INSERT INTO `sys_user` (`username`, `password`, `nickname`, `role`) VALUES
('admin', 'admin123', '系统管理员', 'admin'),
('operator', 'operator123', '值班员张三', 'user');

-- 测试设备
INSERT INTO `sys_device` (`device_name`, `location`, `status`) VALUES
('前门摄像头-A01', '1号楼正门入口', 1),
('后门摄像头-B01', '1号楼后门通道', 1),
('侧门摄像头-C01', '2号楼侧门', 0);

-- 测试告警记录
INSERT INTO `alert_log` (`device_id`, `image_url`, `proximity_ratio`, `danger_level`, `status`) VALUES
(1, '/uploads/alert/20260701_001.jpg', 0.85, 3, 0),
(1, '/uploads/alert/20260701_002.jpg', 0.45, 1, 1),
(2, '/uploads/alert/20260701_003.jpg', 0.72, 2, 0);
