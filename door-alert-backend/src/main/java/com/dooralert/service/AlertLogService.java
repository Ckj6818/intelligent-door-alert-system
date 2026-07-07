package com.dooralert.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.dooralert.dto.AlertLogDTO;
import com.dooralert.dto.AlertUploadDTO;
import com.dooralert.entity.AlertLog;
import com.dooralert.vo.AlertLogVO;

import java.util.List;

public interface AlertLogService extends IService<AlertLog> {

    IPage<AlertLogVO> pageAlerts(long current, long size);

    AlertLogVO getAlertById(Long id);

    boolean addAlert(AlertLogDTO dto);

    boolean updateAlert(Long id, AlertLogDTO dto);

    /**
     * 将告警标记为已处理（status: 0 -> 1）
     */
    boolean handleAlert(Long id);

    /**
     * 边缘端上报告警（供 Python 视觉脚本调用）
     */
    AlertLogVO uploadAlert(AlertUploadDTO dto, org.springframework.web.multipart.MultipartFile file);

    /**
     * 导出全部告警记录（需 alert:export 权限）
     */
    List<AlertLogVO> listAllForExport();

    /**
     * 逻辑删除告警记录
     */
    boolean logicalDeleteAlert(Long id);

    /**
     * 逻辑清空所有活跃告警记录
     */
    boolean logicalClearAll();

    /**
     * 获取近 15 天内被逻辑删除的回收站列表
     */
    List<AlertLogVO> listRecycleBin();

    /**
     * 从回收站中恢复已逻辑删除的记录
     */
    boolean restoreAlert(Long id);

    /**
     * 永久清空回收站中所有的逻辑删除记录
     */
    boolean permanentClearRecycleBin();
}
