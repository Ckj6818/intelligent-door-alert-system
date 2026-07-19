package com.dooralert.controller;

import com.dooralert.common.Result;
import com.dooralert.dto.CleanupPolicyDTO;
import com.dooralert.service.SystemConfigService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 系统参数配置接口（骨架）
 */
@RestController
@RequestMapping("/api/config")
public class ConfigController {

    @Autowired
    private SystemConfigService systemConfigService;

    /**
     * 更新逻辑删除记录自动清理策略
     */
    @PostMapping("/cleanup-policy")
    public Result<CleanupPolicyDTO> updateCleanupPolicy(@RequestBody CleanupPolicyDTO dto) {
        try {
            CleanupPolicyDTO saved = systemConfigService.updateCleanupPolicy(dto);
            return Result.success("清理策略配置已分发", saved);
        } catch (IllegalArgumentException e) {
            return Result.error(400, e.getMessage());
        }
    }
}
