package com.dooralert.util;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

/**
 * 解析对外可访问的站点根 URL（用于 Excel 导出中的图片绝对链接等）。
 * <p>
 * 优先级：配置项 {@code app.public-base-url} / 环境变量 {@code APP_PUBLIC_BASE_URL}
 * → 反向代理头 {@code X-Forwarded-*} → {@link ServletUriComponentsBuilder#fromCurrentContextPath()}。
 * </p>
 */
@Component
public class PublicBaseUrlResolver {

    @Value("${app.public-base-url:}")
    private String configuredBaseUrl;

    /**
     * 解析当前请求对应的外部可访问根地址（不含尾部斜杠）。
     */
    public String resolveBaseUrl(HttpServletRequest request) {
        if (StringUtils.hasText(configuredBaseUrl)) {
            return trimTrailingSlash(configuredBaseUrl.trim());
        }
        if (request != null) {
            String fromForwarded = fromForwardedHeaders(request);
            if (StringUtils.hasText(fromForwarded)) {
                return fromForwarded;
            }
            try {
                String fromContext = ServletUriComponentsBuilder
                        .fromCurrentContextPath()
                        .build()
                        .toUriString();
                if (StringUtils.hasText(fromContext)) {
                    return trimTrailingSlash(fromContext);
                }
            } catch (IllegalStateException ignored) {
                // 无 RequestAttributes（如部分单元测试）时回退到 request 本身
            }
            return fromRequest(request);
        }
        return "";
    }

    /**
     * 将相对路径（如 /uploads/xxx.jpg）拼成绝对 URL；已是 http(s) 则原样返回。
     */
    public String toAbsoluteUrl(String pathOrUrl, HttpServletRequest request) {
        return toAbsoluteUrl(pathOrUrl, resolveBaseUrl(request));
    }

    public String toAbsoluteUrl(String pathOrUrl, String baseUrl) {
        if (!StringUtils.hasText(pathOrUrl)) {
            return pathOrUrl;
        }
        String value = pathOrUrl.trim();
        if (value.startsWith("http://") || value.startsWith("https://")) {
            return value;
        }
        if (!StringUtils.hasText(baseUrl)) {
            return value;
        }
        String base = trimTrailingSlash(baseUrl.trim());
        if (!value.startsWith("/")) {
            value = "/" + value;
        }
        return base + value;
    }

    private static String fromForwardedHeaders(HttpServletRequest request) {
        String proto = firstHeader(request, "X-Forwarded-Proto");
        String host = firstHeader(request, "X-Forwarded-Host");
        if (!StringUtils.hasText(host)) {
            return null;
        }
        // X-Forwarded-Host 可能已含端口：example.com:443
        String hostOnly = host.split(",")[0].trim();
        String scheme = StringUtils.hasText(proto)
                ? proto.split(",")[0].trim().toLowerCase()
                : request.getScheme();
        String portHeader = firstHeader(request, "X-Forwarded-Port");
        if (hostOnly.contains(":")) {
            return scheme + "://" + hostOnly;
        }
        if (StringUtils.hasText(portHeader)) {
            String port = portHeader.split(",")[0].trim();
            if (!isDefaultPort(scheme, port)) {
                return scheme + "://" + hostOnly + ":" + port;
            }
        }
        return scheme + "://" + hostOnly;
    }

    private static String fromRequest(HttpServletRequest request) {
        String scheme = request.getScheme();
        String host = request.getServerName();
        int port = request.getServerPort();
        StringBuilder sb = new StringBuilder();
        sb.append(scheme).append("://").append(host);
        if (!isDefaultPort(scheme, String.valueOf(port))) {
            sb.append(':').append(port);
        }
        String ctx = request.getContextPath();
        if (StringUtils.hasText(ctx) && !"/".equals(ctx)) {
            sb.append(trimTrailingSlash(ctx));
        }
        return sb.toString();
    }

    private static boolean isDefaultPort(String scheme, String port) {
        if (!StringUtils.hasText(port)) {
            return true;
        }
        return ("http".equalsIgnoreCase(scheme) && "80".equals(port))
                || ("https".equalsIgnoreCase(scheme) && "443".equals(port));
    }

    private static String firstHeader(HttpServletRequest request, String name) {
        String value = request.getHeader(name);
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private static String trimTrailingSlash(String url) {
        if (url == null || url.isEmpty()) {
            return url;
        }
        int end = url.length();
        while (end > 0 && url.charAt(end - 1) == '/') {
            end--;
        }
        return url.substring(0, end);
    }
}
