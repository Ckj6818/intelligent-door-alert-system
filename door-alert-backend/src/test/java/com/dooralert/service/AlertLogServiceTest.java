package com.dooralert.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.dooralert.dto.AlertUploadDTO;
import com.dooralert.entity.AlertLog;
import com.dooralert.entity.SysDevice;
import com.dooralert.mapper.AlertLogMapper;
import com.dooralert.mapper.SysDeviceMapper;
import com.dooralert.vo.AlertLogVO;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 告警日志服务单元测试
 */
@SpringBootTest
@ActiveProfiles("test")
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class AlertLogServiceTest {

    @Autowired
    private AlertLogService alertLogService;

    @Autowired
    private AlertLogMapper alertLogMapper;

    @Autowired
    private SysDeviceMapper sysDeviceMapper;

    private Long testDeviceId;

    @BeforeEach
    void setUp() {
        // 清空数据
        alertLogMapper.delete(null);
        sysDeviceMapper.delete(null);

        // 插入测试设备
        SysDevice device = new SysDevice();
        device.setDeviceName("测试摄像头-T01");
        device.setLocation("测试大门");
        device.setStatus(1);
        sysDeviceMapper.insert(device);
        testDeviceId = device.getId();
    }

    @Test
    @Order(1)
    @DisplayName("告警上报 — 无图片文件也应成功入库")
    void uploadAlert_withoutFile_shouldSave() {
        AlertUploadDTO dto = new AlertUploadDTO();
        dto.setDeviceId(testDeviceId);
        dto.setProximityRatio(0.55);
        dto.setDangerLevel(3);

        AlertLogVO result = alertLogService.uploadAlert(dto, null);

        assertNotNull(result, "上报结果不应为空");
        assertNotNull(result.getId(), "记录 ID 不应为空");
        assertEquals(testDeviceId, result.getDeviceId());
        assertEquals(3, result.getDangerLevel());
        assertEquals(0, result.getStatus(), "新上报的告警应为未处理状态");
    }

    @Test
    @Order(2)
    @DisplayName("处理告警 — 状态应从 0 变为 1")
    void handleAlert_shouldChangeStatus() {
        // 先创建一条告警
        AlertLog entity = new AlertLog();
        entity.setDeviceId(testDeviceId);
        entity.setProximityRatio(0.45);
        entity.setDangerLevel(2);
        entity.setStatus(0);
        entity.setDeleted(0);
        alertLogMapper.insert(entity);

        boolean result = alertLogService.handleAlert(entity.getId());
        assertTrue(result, "处理告警应成功");

        AlertLogVO updated = alertLogService.getAlertById(entity.getId());
        assertEquals(1, updated.getStatus(), "处理后状态应为 1（已处理）");
    }

    @Test
    @Order(3)
    @DisplayName("逻辑删除 — 删除后应从活跃列表消失，出现在回收站")
    void logicalDelete_shouldMoveToRecycleBin() {
        // 创建告警
        AlertLog entity = new AlertLog();
        entity.setDeviceId(testDeviceId);
        entity.setProximityRatio(0.60);
        entity.setDangerLevel(3);
        entity.setStatus(0);
        entity.setDeleted(0);
        alertLogMapper.insert(entity);
        Long alertId = entity.getId();

        // 逻辑删除
        boolean deleted = alertLogService.logicalDeleteAlert(alertId);
        assertTrue(deleted, "逻辑删除应成功");

        // 活跃列表应查不到
        AlertLogVO activeResult = alertLogService.getAlertById(alertId);
        assertNull(activeResult, "逻辑删除后不应出现在活跃查询中");

        // 回收站应能查到
        List<AlertLogVO> recycleBin = alertLogService.listRecycleBin();
        boolean foundInRecycleBin = recycleBin.stream()
                .anyMatch(vo -> alertId.equals(vo.getId()));
        assertTrue(foundInRecycleBin, "逻辑删除后应出现在回收站中");
    }

    @Test
    @Order(4)
    @DisplayName("恢复告警 — 从回收站恢复后应重新出现在活跃列表")
    void restoreAlert_shouldReappearInActiveList() {
        // 创建并逻辑删除
        AlertLog entity = new AlertLog();
        entity.setDeviceId(testDeviceId);
        entity.setProximityRatio(0.35);
        entity.setDangerLevel(2);
        entity.setStatus(0);
        entity.setDeleted(0);
        alertLogMapper.insert(entity);
        alertLogService.logicalDeleteAlert(entity.getId());

        // 恢复
        boolean restored = alertLogService.restoreAlert(entity.getId());
        assertTrue(restored, "恢复应成功");

        // 活跃列表应能查到
        AlertLogVO result = alertLogService.getAlertById(entity.getId());
        assertNotNull(result, "恢复后应能从活跃列表查到");
    }

    @Test
    @Order(5)
    @DisplayName("分页查询 — 应正确返回分页数据")
    void pageAlerts_shouldReturnPaginatedData() {
        // 插入 3 条告警
        for (int i = 0; i < 3; i++) {
            AlertLog entity = new AlertLog();
            entity.setDeviceId(testDeviceId);
            entity.setProximityRatio(0.30 + i * 0.1);
            entity.setDangerLevel(i + 1);
            entity.setStatus(0);
            entity.setDeleted(0);
            alertLogMapper.insert(entity);
        }

        // 第 1 页，每页 2 条
        IPage<AlertLogVO> page = alertLogService.pageAlerts(1, 2);
        assertEquals(2, page.getRecords().size(), "每页应返回 2 条");
        assertEquals(3, page.getTotal(), "总数应为 3");
        assertEquals(2, page.getPages(), "应有 2 页");
    }

    @Test
    @Order(6)
    @DisplayName("永久清空回收站 — 物理删除所有已逻辑删除的记录")
    void permanentClearRecycleBin_shouldPhysicallyDelete() {
        // 创建 2 条并逻辑删除
        for (int i = 0; i < 2; i++) {
            AlertLog entity = new AlertLog();
            entity.setDeviceId(testDeviceId);
            entity.setProximityRatio(0.50);
            entity.setDangerLevel(2);
            entity.setStatus(0);
            entity.setDeleted(0);
            alertLogMapper.insert(entity);
            alertLogService.logicalDeleteAlert(entity.getId());
        }

        boolean cleared = alertLogService.permanentClearRecycleBin();
        assertTrue(cleared, "清空回收站应成功");

        List<AlertLogVO> recycleBin = alertLogService.listRecycleBin();
        assertTrue(recycleBin.isEmpty(), "清空后回收站应为空");
    }
}
