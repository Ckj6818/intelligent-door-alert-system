package com.dooralert.service;

import com.dooralert.vo.AlertWsPayload;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestTemplate;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 外部告警 Webhook 异步推送服务（自动适配 企业微信 / 钉钉 / 飞书 / 通用 JSON Webhook）
 */
@Slf4j
@Service
public class WebhookNotifyService {

    private static final DateTimeFormatter TIME_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    @Value("${alert.webhook.enabled:false}")
    private boolean defaultEnabled;

    @Value("${alert.webhook.url:}")
    private String defaultUrl;

    @Value("${alert.webhook.min-danger-level:2}")
    private int defaultMinDangerLevel;

    @Value("${app.public-base-url:http://localhost:5173}")
    private String publicBaseUrl;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final RestTemplate restTemplate;
    private final WebhookConfig runtimeConfig = new WebhookConfig();

    public WebhookNotifyService() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(4000);
        factory.setReadTimeout(5000);
        this.restTemplate = new RestTemplate(factory);
    }

    @PostConstruct
    public void init() {
        runtimeConfig.setEnabled(defaultEnabled);
        runtimeConfig.setUrl(defaultUrl == null ? "" : defaultUrl.trim());
        runtimeConfig.setMinDangerLevel(defaultMinDangerLevel);
        loadPersistedConfig();
    }

    public synchronized WebhookConfig getConfig() {
        WebhookConfig copy = new WebhookConfig();
        copy.setEnabled(runtimeConfig.isEnabled());
        copy.setUrl(runtimeConfig.getUrl());
        copy.setMinDangerLevel(runtimeConfig.getMinDangerLevel());
        return copy;
    }

    public synchronized WebhookConfig updateConfig(WebhookConfig incoming) {
        if (incoming != null) {
            runtimeConfig.setEnabled(incoming.isEnabled());
            runtimeConfig.setUrl(incoming.getUrl() == null ? "" : incoming.getUrl().trim());
            int lvl = incoming.getMinDangerLevel();
            runtimeConfig.setMinDangerLevel(Math.max(1, Math.min(3, lvl)));
            savePersistedConfig();
        }
        return getConfig();
    }

    @Async
    public void sendAlertAsync(AlertWsPayload payload) {
        if (payload == null) {
            return;
        }
        WebhookConfig cfg = getConfig();
        if (!cfg.isEnabled() || !StringUtils.hasText(cfg.getUrl())) {
            return;
        }
        int level = payload.getAlertLevel() != null ? payload.getAlertLevel() : 2;
        if (level < cfg.getMinDangerLevel()) {
            return;
        }
        try {
            String title = buildAlertTitle(payload);
            String markdown = buildAlertMarkdown(payload);
            postWebhook(cfg.getUrl(), title, markdown, payload);
            log.info("外部告警 Webhook 推送成功: alertId={}, type={}, level={}",
                    payload.getAlertId(), payload.getAlertType(), level);
        } catch (Exception e) {
            log.warn("外部告警 Webhook 推送失败: alertId={}, err={}", payload.getAlertId(), e.getMessage());
        }
    }

    public String sendTestNotification(String overrideUrl) {
        WebhookConfig cfg = getConfig();
        String targetUrl = StringUtils.hasText(overrideUrl) ? overrideUrl.trim() : cfg.getUrl();
        if (!StringUtils.hasText(targetUrl)) {
            throw new IllegalArgumentException("请先填写 Webhook 机器人地址");
        }
        String title = "【DoorAlert】告警通知通道测试";
        String markdown = "### 🔔 DoorAlert 智能门禁推送测试\n"
                + "- **通道状态**：连通正常\n"
                + "- **支持事件**：未授权入侵 / 尾随闯入 / 门前徘徊\n"
                + "- **最低推送等级**：Level >= " + cfg.getMinDangerLevel() + "\n"
                + "- **发送时间**：" + java.time.LocalDateTime.now().format(TIME_FMT);
        ResponseEntity<String> resp = postWebhook(targetUrl, title, markdown, null);
        return "HTTP " + resp.getStatusCode().value() + (resp.getBody() != null ? " · " + resp.getBody() : "");
    }

    private ResponseEntity<String> postWebhook(String url, String title, String markdown, AlertWsPayload rawPayload) {
        Map<String, Object> body = buildPlatformBody(url, title, markdown, rawPayload);
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
        return restTemplate.postForEntity(url, entity, String.class);
    }

    private Map<String, Object> buildPlatformBody(String url, String title, String markdown, AlertWsPayload rawPayload) {
        String lower = url.toLowerCase(Locale.ROOT);
        if (lower.contains("oapi.dingtalk.com")) {
            return Map.of(
                    "msgtype", "markdown",
                    "markdown", Map.of("title", title, "text", markdown)
            );
        }
        if (lower.contains("qyapi.weixin.qq.com")) {
            return Map.of(
                    "msgtype", "markdown",
                    "markdown", Map.of("content", markdown)
            );
        }
        if (lower.contains("open.feishu.cn")) {
            String plain = markdown.replace("### ", "").replace("**", "");
            return Map.of(
                    "msgtype", "post",
                    "content", Map.of(
                            "post", Map.of(
                                    "zh_cn", Map.of(
                                            "title", title,
                                            "content", List.of(List.of(Map.of("tag", "text", "text", plain)))
                                    )
                            )
                    )
            );
        }
        Map<String, Object> generic = new LinkedHashMap<>();
        generic.put("title", title);
        generic.put("markdown", markdown);
        if (rawPayload != null) {
            generic.put("alert", rawPayload);
        }
        return generic;
    }

    private String buildAlertTitle(AlertWsPayload p) {
        String type = p.getAlertType() != null ? p.getAlertType().toUpperCase(Locale.ROOT) : "INTRUSION";
        return switch (type) {
            case "TAILGATING" -> "🚨 【尾随闯入告警】";
            case "LOITERING" -> "⚠️ 【门前徘徊超时告警】";
            case "SPOOFING" -> "🛡️ 【照片/屏幕防伪拦截告警】";
            default -> "🔴 【未授权人员入侵告警】";
        };
    }

    private String buildAlertMarkdown(AlertWsPayload p) {
        int level = p.getAlertLevel() != null ? p.getAlertLevel() : 2;
        String levelText = level >= 3 ? "高危 (Level 3)" : level == 2 ? "中危 (Level 2)" : "低危 (Level 1)";
        String proxText = p.getAreaRatio() != null
                ? String.format(Locale.ROOT, "%.1f%%", p.getAreaRatio() * 100.0)
                : "-";
        String timeText = p.getTimestamp() != null
                ? p.getTimestamp().format(TIME_FMT)
                : java.time.LocalDateTime.now().format(TIME_FMT);
        String imgLink = "";
        if (StringUtils.hasText(p.getImageUrl())) {
            String raw = p.getImageUrl().trim();
            String fullUrl = raw.startsWith("http")
                    ? raw
                    : publicBaseUrl.replaceAll("/$", "") + (raw.startsWith("/") ? "" : "/") + raw;
            imgLink = "\n- **抓拍凭证**：[点击查看抓拍图](" + fullUrl + ")";
        }

        return "### " + buildAlertTitle(p) + "\n"
                + "- **识别结果**：" + (StringUtils.hasText(p.getRecognizedName()) ? p.getRecognizedName() : "未授权人员/陌生人") + "\n"
                + "- **风险等级**：" + levelText + "\n"
                + "- **目标接近度**：" + proxText + "\n"
                + "- **设备节点**：#" + (p.getDeviceId() != null ? p.getDeviceId() : 1) + "\n"
                + "- **告警时间**：" + timeText
                + imgLink;
    }

    private Path resolveConfigFile() {
        return Paths.get(System.getProperty("user.dir"), "webhook-config.json");
    }

    private void loadPersistedConfig() {
        try {
            Path p = resolveConfigFile();
            if (Files.isRegularFile(p)) {
                WebhookConfig saved = objectMapper.readValue(p.toFile(), WebhookConfig.class);
                if (saved != null) {
                    runtimeConfig.setEnabled(saved.isEnabled());
                    runtimeConfig.setUrl(saved.getUrl() == null ? "" : saved.getUrl().trim());
                    runtimeConfig.setMinDangerLevel(Math.max(1, Math.min(3, saved.getMinDangerLevel())));
                }
            }
        } catch (Exception e) {
            log.warn("加载 webhook-config.json 失败: {}", e.getMessage());
        }
    }

    private void savePersistedConfig() {
        try {
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(resolveConfigFile().toFile(), runtimeConfig);
        } catch (Exception e) {
            log.warn("保存 webhook-config.json 失败: {}", e.getMessage());
        }
    }

    @Data
    public static class WebhookConfig {
        private boolean enabled = false;
        private String url = "";
        private int minDangerLevel = 2;
    }
}
