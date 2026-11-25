package com.dooralert.controller;

import cn.dev33.satoken.annotation.SaCheckRole;
import com.dooralert.common.Result;
import com.dooralert.service.WebhookNotifyService;
import com.dooralert.service.WebhookNotifyService.WebhookConfig;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 外部告警 Webhook 配置与测试接口（企业微信 / 钉钉 / 飞书）
 */
@RestController
@RequestMapping("/api/webhook")
public class WebhookController {

    @Autowired
    private WebhookNotifyService webhookNotifyService;

    @GetMapping("/config")
    @SaCheckRole("ADMIN")
    public Result<WebhookConfig> getConfig() {
        return Result.success(webhookNotifyService.getConfig());
    }

    @PutMapping("/config")
    @SaCheckRole("ADMIN")
    public Result<WebhookConfig> saveConfig(@RequestBody WebhookConfig config) {
        return Result.success("Webhook 推送配置已保存", webhookNotifyService.updateConfig(config));
    }

    @PostMapping("/test")
    @SaCheckRole("ADMIN")
    public Result<String> test(@RequestBody(required = false) Map<String, String> body) {
        try {
            String url = body != null ? body.get("url") : null;
            String publicBaseUrl = body != null ? body.get("publicBaseUrl") : null;
            String resp = webhookNotifyService.sendTestNotification(url, publicBaseUrl);
            return Result.success("测试消息发送成功", resp);
        } catch (Exception e) {
            return Result.error("测试消息发送失败: " + e.getMessage());
        }
    }
}
