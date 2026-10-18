-- H2 测试环境建表脚本 (兼容 MySQL 模式)

CREATE TABLE IF NOT EXISTS `sys_user` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT,
    `username`    VARCHAR(50)  NOT NULL,
    `password`    VARCHAR(100) NOT NULL,
    `nickname`    VARCHAR(50)  DEFAULT NULL,
    `role`        VARCHAR(20)  NOT NULL DEFAULT 'OPERATOR',
    `create_time` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE (`username`)
);

CREATE TABLE IF NOT EXISTS `sys_device` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT,
    `device_name` VARCHAR(100) NOT NULL,
    `location`    VARCHAR(200) DEFAULT NULL,
    `status`      TINYINT      NOT NULL DEFAULT 0,
    `edge_config` VARCHAR(1000) DEFAULT NULL,
    `create_time` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS `alert_log` (
    `id`              BIGINT        NOT NULL AUTO_INCREMENT,
    `device_id`       BIGINT        NOT NULL,
    `image_url`       VARCHAR(500)  DEFAULT NULL,
    `proximity_ratio` DOUBLE        NOT NULL DEFAULT 0,
    `danger_level`    INT           NOT NULL DEFAULT 0,
    `auth_status`     VARCHAR(20)   DEFAULT NULL,
    `alert_type`      VARCHAR(20)   DEFAULT 'INTRUSION',
    `recognized_name` VARCHAR(100)  DEFAULT NULL,
    `status`          TINYINT       NOT NULL DEFAULT 0,
    `create_time`     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `deleted`         INT           DEFAULT 0,
    `delete_time`     TIMESTAMP     DEFAULT NULL,
    PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS `sys_authorized_user` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT,
    `user_code`   VARCHAR(50)  NOT NULL,
    `name`        VARCHAR(50)  NOT NULL,
    `department`  VARCHAR(100) DEFAULT NULL,
    `avatar_url`  VARCHAR(500) DEFAULT NULL,
    `status`      TINYINT      NOT NULL DEFAULT 1,
    `create_time` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE (`user_code`)
);

CREATE TABLE IF NOT EXISTS `passage_log` (
    `id`              BIGINT        NOT NULL AUTO_INCREMENT,
    `device_id`       BIGINT        NOT NULL,
    `recognized_name` VARCHAR(100)  DEFAULT NULL,
    `auth_status`     VARCHAR(20)   NOT NULL DEFAULT 'AUTHORIZED',
    `proximity_ratio` DOUBLE        NOT NULL DEFAULT 0,
    `image_url`       VARCHAR(500)  DEFAULT NULL,
    `create_time`     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
);
