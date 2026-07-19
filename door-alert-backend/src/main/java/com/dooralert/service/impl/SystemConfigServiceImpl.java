package com.dooralert.service.impl;

import com.dooralert.dto.CleanupPolicyDTO;
import com.dooralert.service.SystemConfigService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 系统配置服务：当前以内存变量保存清理策略骨架
 */
@Slf4j
@Service
public class SystemConfigServiceImpl implements SystemConfigService {

    private volatile CleanupPolicyDTO cleanupPolicy = defaultPolicy();

    private static CleanupPolicyDTO defaultPolicy() {
        CleanupPolicyDTO dto = new CleanupPolicyDTO();
        dto.setPolicy("24h");
        dto.setIntervalDays(1);
        return dto;
    }

    @Override
    public CleanupPolicyDTO getCleanupPolicy() {
        CleanupPolicyDTO snapshot = new CleanupPolicyDTO();
        snapshot.setPolicy(cleanupPolicy.getPolicy());
        snapshot.setIntervalDays(cleanupPolicy.getIntervalDays());
        return snapshot;
    }

    @Override
    public CleanupPolicyDTO updateCleanupPolicy(CleanupPolicyDTO dto) {
        if (dto == null || dto.getPolicy() == null || dto.getPolicy().isBlank()) {
            throw new IllegalArgumentException("清理策略 policy 不能为空");
        }

        CleanupPolicyDTO normalized = new CleanupPolicyDTO();
        normalized.setPolicy(dto.getPolicy().trim());
        normalized.setIntervalDays(resolveIntervalDays(normalized.getPolicy(), dto.getIntervalDays()));

        this.cleanupPolicy = normalized;
        log.info("System cleanup policy updated to: policy={}, intervalDays={}",
                normalized.getPolicy(), normalized.getIntervalDays());
        return getCleanupPolicy();
    }

    private int resolveIntervalDays(String policy, Integer intervalDays) {
        if (intervalDays != null) {
            return intervalDays;
        }
        return switch (policy) {
            case "24h" -> 1;
            case "7d" -> 7;
            case "never" -> -1;
            default -> throw new IllegalArgumentException("不支持的清理策略: " + policy);
        };
    }
}
