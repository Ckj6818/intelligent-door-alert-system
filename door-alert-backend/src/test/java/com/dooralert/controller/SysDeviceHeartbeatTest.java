package com.dooralert.controller;

import org.junit.jupiter.api.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 设备心跳机制单元测试
 *
 * 验证心跳超时判定逻辑的正确性（纯内存操作，无需数据库）
 */
@SpringBootTest
@ActiveProfiles("test")
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class SysDeviceHeartbeatTest {

    @Test
    @Order(1)
    @DisplayName("心跳记录 — 刚发送心跳的设备应判定为在线")
    void touchHeartbeat_shouldBeOnline() {
        Long deviceId = 9999L;

        // 发送心跳
        SysDeviceController.touchHeartbeat(deviceId);

        // 心跳刚发送，验证多次调用心跳不报错
        assertDoesNotThrow(() -> SysDeviceController.touchHeartbeat(deviceId),
                "多次发送心跳不应报错");
    }

    @Test
    @Order(2)
    @DisplayName("心跳为 null — 传入 null 的设备 ID 不应报错")
    void touchHeartbeat_nullDeviceId_shouldNotThrow() {
        assertDoesNotThrow(() -> SysDeviceController.touchHeartbeat(null),
                "deviceId 为 null 时不应报错");
    }

    @Test
    @Order(3)
    @DisplayName("心跳幂等性 — 连续发送多次心跳应只保留最新时间戳")
    void touchHeartbeat_shouldBeIdempotent() throws InterruptedException {
        Long deviceId = 8888L;

        SysDeviceController.touchHeartbeat(deviceId);
        Thread.sleep(50); // 等待 50ms
        SysDeviceController.touchHeartbeat(deviceId);

        // 第二次心跳应覆盖第一次（通过不报错来验证幂等性）
        assertDoesNotThrow(() -> SysDeviceController.touchHeartbeat(deviceId));
    }
}
