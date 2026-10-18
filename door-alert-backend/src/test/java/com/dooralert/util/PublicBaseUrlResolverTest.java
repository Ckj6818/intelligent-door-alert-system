package com.dooralert.util;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.*;

class PublicBaseUrlResolverTest {

    private PublicBaseUrlResolver resolver;

    @BeforeEach
    void setUp() {
        resolver = new PublicBaseUrlResolver();
        ReflectionTestUtils.setField(resolver, "configuredBaseUrl", "");
    }

    @Test
    @DisplayName("显式配置 app.public-base-url 时优先使用配置值")
    void resolve_prefersConfiguredBaseUrl() {
        ReflectionTestUtils.setField(resolver, "configuredBaseUrl", "https://door.example.com/");
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/alerts/export");
        request.setScheme("http");
        request.setServerName("localhost");
        request.setServerPort(8081);

        assertEquals("https://door.example.com", resolver.resolveBaseUrl(request));
        assertEquals(
                "https://door.example.com/uploads/a.jpg",
                resolver.toAbsoluteUrl("/uploads/a.jpg", request)
        );
    }

    @Test
    @DisplayName("未配置时使用 X-Forwarded-Proto/Host/Port 生成绝对地址")
    void resolve_usesForwardedHeaders() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/alerts/export");
        request.addHeader("X-Forwarded-Proto", "https");
        request.addHeader("X-Forwarded-Host", "gateway.example.com");
        request.addHeader("X-Forwarded-Port", "443");
        request.setScheme("http");
        request.setServerName("localhost");
        request.setServerPort(8081);

        assertEquals("https://gateway.example.com", resolver.resolveBaseUrl(request));
        assertEquals(
                "https://gateway.example.com/uploads/snap.jpg",
                resolver.toAbsoluteUrl("uploads/snap.jpg", request)
        );
    }

    @Test
    @DisplayName("已是绝对 URL 时不重复拼接")
    void toAbsolute_keepsExistingAbsoluteUrl() {
        assertEquals(
                "https://cdn.example.com/a.jpg",
                resolver.toAbsoluteUrl("https://cdn.example.com/a.jpg", "http://localhost:8081")
        );
    }

    @Test
    @DisplayName("无配置且无转发头时回退到请求自身 scheme/host/port")
    void resolve_fallsBackToRequest() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/alerts/export");
        request.setScheme("http");
        request.setServerName("192.168.1.10");
        request.setServerPort(8081);

        assertEquals("http://192.168.1.10:8081", resolver.resolveBaseUrl(request));
    }
}
