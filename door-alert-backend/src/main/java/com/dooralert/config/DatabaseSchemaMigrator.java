package com.dooralert.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * 启动期轻量级表结构平滑迁移器：
 * 自动检测并为已有 MySQL / H2 库补齐工单处置审计列（handler / handle_time / handle_remark），
 * 免除手动执行增量 SQL 脚本，保证旧库无缝升级。
 */
@Slf4j
@Component
public class DatabaseSchemaMigrator implements ApplicationRunner {

    @Autowired
    private DataSource dataSource;

    @Override
    public void run(ApplicationArguments args) {
        try (Connection conn = dataSource.getConnection()) {
            Set<String> existing = loadColumns(conn, "alert_log");
            if (existing.isEmpty()) {
                existing = loadColumns(conn, "ALERT_LOG");
            }
            if (existing.isEmpty()) {
                return;
            }
            try (Statement stmt = conn.createStatement()) {
                if (!existing.contains("handler")) {
                    stmt.execute("ALTER TABLE alert_log ADD COLUMN handler VARCHAR(50) DEFAULT NULL");
                    log.info("数据库平滑迁移：alert_log 新增列 handler");
                }
                if (!existing.contains("handle_time")) {
                    stmt.execute("ALTER TABLE alert_log ADD COLUMN handle_time TIMESTAMP NULL DEFAULT NULL");
                    log.info("数据库平滑迁移：alert_log 新增列 handle_time");
                }
                if (!existing.contains("handle_remark")) {
                    stmt.execute("ALTER TABLE alert_log ADD COLUMN handle_remark VARCHAR(255) DEFAULT NULL");
                    log.info("数据库平滑迁移：alert_log 新增列 handle_remark");
                }
            }
        } catch (Exception e) {
            log.warn("数据库表结构检查跳过或已完成: {}", e.getMessage());
        }
    }

    private Set<String> loadColumns(Connection conn, String tableName) throws Exception {
        Set<String> cols = new HashSet<>();
        DatabaseMetaData meta = conn.getMetaData();
        try (ResultSet rs = meta.getColumns(conn.getCatalog(), null, tableName, "%")) {
            while (rs.next()) {
                String name = rs.getString("COLUMN_NAME");
                if (name != null) {
                    cols.add(name.toLowerCase(Locale.ROOT));
                }
            }
        }
        return cols;
    }
}
