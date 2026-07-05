package com.dooralert.config;

import cn.dev33.satoken.jwt.StpLogicJwtForSimple;
import cn.dev33.satoken.stp.StpLogic;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Sa-Token JWT 无状态模式配置。
 * 登录后签发 JWT，服务端无需维护 Session，适合前后端分离架构。
 */
@Configuration
public class SaTokenJwtConfig {

    @Bean
    public StpLogic getStpLogicJwt() {
        return new StpLogicJwtForSimple();
    }
}
