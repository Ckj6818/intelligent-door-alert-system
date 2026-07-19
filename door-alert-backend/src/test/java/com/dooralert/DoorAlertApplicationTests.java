package com.dooralert;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * 基础冒烟测试 — 验证 Spring 容器能够正常加载。
 * <p>
 * 使用 test profile 以切换到 H2 内存数据库，
 * 避免对外部 MySQL 实例的依赖。
 */
@SpringBootTest
@ActiveProfiles("test")
class DoorAlertApplicationTests {

    /**
     * 空测试方法：如果 Spring ApplicationContext 无法加载，
     * 此测试会自动失败，从而提前暴露配置 / Bean 装配问题。
     */
    @Test
    void contextLoads() {
        // Spring context loads successfully — no assertions needed
    }

}
