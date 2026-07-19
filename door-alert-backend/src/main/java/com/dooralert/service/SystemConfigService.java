package com.dooralert.service;

import com.dooralert.dto.CleanupPolicyDTO;

/**
 * 系统运行时配置（内存持有，供后续定时任务扩展）
 */
public interface SystemConfigService {

    CleanupPolicyDTO getCleanupPolicy();

    CleanupPolicyDTO updateCleanupPolicy(CleanupPolicyDTO dto);
}
