-- ============================================================
-- 智能门禁安防系统 - 种子数据补充脚本（答辩演示专用）
-- 用法: mysql -uroot -p intelligent_door_alert < docs/seed_data.sql
-- 说明: 不清空用户/设备，仅刷新告警历史数据
-- ============================================================

USE `intelligent_door_alert`;

-- 清空旧告警，保留用户与设备
TRUNCATE TABLE `alert_log`;

-- 确保基础设备存在（幂等）
INSERT IGNORE INTO `sys_device` (`id`, `device_name`, `location`, `status`) VALUES
(1, '前门摄像头-A01', '1号楼正门入口', 1),
(2, '后门摄像头-B01', '1号楼后门通道', 1),
(3, '侧门摄像头-C01', '2号楼侧门', 0);

-- 确保管理员与安保账号存在，并统一角色枚举为 ADMIN / OPERATOR
INSERT INTO `sys_user` (`username`, `password`, `nickname`, `role`) VALUES
('admin', '123456', '系统管理员', 'ADMIN'),
('security', '123456', '安保值班员', 'OPERATOR')
ON DUPLICATE KEY UPDATE
    `password` = VALUES(`password`),
    `nickname` = VALUES(`nickname`),
    `role` = VALUES(`role`);

-- 将历史数据中的旧角色值迁移为新枚举
UPDATE `sys_user` SET `role` = 'ADMIN' WHERE `username` = 'admin';
UPDATE `sys_user` SET `role` = 'OPERATOR' WHERE `username` IN ('security', 'operator');
UPDATE `sys_user` SET `role` = 'OPERATOR' WHERE `role` IN ('user', 'admin') AND `username` <> 'admin';

-- 批量注入 55 条高质量历史告警
INSERT INTO `alert_log` (`device_id`, `image_url`, `proximity_ratio`, `danger_level`, `status`, `create_time`)
SELECT
    1 + MOD(n - 1, 3) AS device_id,
    ELT(
        1 + MOD(n - 1, 9),
        '/uploads/da6722ed206942b3852ed18f8092876d.jpg',
        '/uploads/7bb8f51599c743c2a05d6d76b3996251.jpg',
        '/uploads/91173d3e06034572826298d9ba1bc203.jpg',
        '/uploads/de345823e02f4f16a4f266948c8eaf6b.jpg',
        '/uploads/aaaf2c3267d94b7597c99155e3b01409.jpg',
        '/uploads/5726f58e98b442279aa4a51e2c741511.jpg',
        '/uploads/hero.png',
        '/uploads/4626b980aae845b9b92bac4336963dd1.jpg',
        '/uploads/f9326d6b3c194f2794101868b35a4b94.jpg'
    ) AS image_url,
    CASE level_cycle
        WHEN 3 THEN ROUND(0.55 + (MOD(n * 17, 43) / 100.0), 4)
        WHEN 2 THEN ROUND(0.35 + (MOD(n * 11, 31) / 100.0), 4)
        ELSE ROUND(0.30 + (MOD(n * 7, 16) / 100.0), 4)
    END AS proximity_ratio,
    level_cycle AS danger_level,
    IF(MOD(n, 5) = 0, 0, 1) AS status,
    DATE_SUB(
        DATE_SUB(CURDATE(), INTERVAL MOD(n - 1, 5) DAY),
        INTERVAL MOD(n * 3, 24) HOUR
    ) AS create_time
FROM (
    SELECT
        n,
        ELT(1 + MOD(n - 1, 3), 3, 2, 1) AS level_cycle
    FROM (
        WITH RECURSIVE seq AS (
            SELECT 1 AS n
            UNION ALL
            SELECT n + 1 FROM seq WHERE n < 55
        )
        SELECT n FROM seq
    ) AS seq_numbers
) AS seed;

SELECT
    danger_level,
    status,
    COUNT(*) AS total
FROM `alert_log`
GROUP BY danger_level, status
ORDER BY danger_level DESC, status;
