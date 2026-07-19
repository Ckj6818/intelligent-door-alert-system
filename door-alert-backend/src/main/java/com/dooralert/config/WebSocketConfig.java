package com.dooralert.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.web.socket.server.standard.ServerEndpointExporter;

/**
 * WebSocket 端点注册配置
 */
@Configuration
public class WebSocketConfig {

    /**
     * 单元测试使用 Mock Web 环境，无 Servlet 容器，需排除该 Bean。
     */
    @Bean
    @Profile("!test")
    public ServerEndpointExporter serverEndpointExporter() {
        return new ServerEndpointExporter();
    }
}
