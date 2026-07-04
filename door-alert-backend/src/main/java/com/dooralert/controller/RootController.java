package com.dooralert.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 根路径访问提示，避免直接在浏览器访问时出现 404 Whitelabel Error Page
 */
@RestController
public class RootController {

    @GetMapping("/")
    public String index() {
        return "<h3>Intelligent Door Alert System Backend is Running!</h3>" +
               "<p>这是一个纯 API 服务端，当前运行正常。</p>" +
               "<p>告警上报接口请使用 POST /api/alerts/upload</p>";
    }
}
