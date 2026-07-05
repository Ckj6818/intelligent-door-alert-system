package com.dooralert.ws;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import jakarta.websocket.OnClose;
import jakarta.websocket.OnError;
import jakarta.websocket.OnOpen;
import jakarta.websocket.Session;
import jakarta.websocket.server.ServerEndpoint;
import lombok.extern.slf4j.Slf4j;

import java.util.Set;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 告警实时推送 WebSocket 服务端
 * <p>
 * 维护大屏客户端连接，在边缘端上报新告警后异步广播 JSON 数据。
 * </p>
 */
@Slf4j
@ServerEndpoint("/ws/alerts")
public class AlertWebSocketServer {

    private static final Set<Session> SESSIONS = new CopyOnWriteArraySet<>();

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper()
            .registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    private static final ExecutorService BROADCAST_EXECUTOR = Executors.newSingleThreadExecutor(r -> {
        Thread thread = new Thread(r, "ws-alert-broadcast");
        thread.setDaemon(true);
        return thread;
    });

    @OnOpen
    public void onOpen(Session session) {
        SESSIONS.add(session);
        log.info("大屏客户端已连接，sessionId={}，当前在线数={}", session.getId(), SESSIONS.size());
    }

    @OnClose
    public void onClose(Session session) {
        SESSIONS.remove(session);
        log.info("大屏客户端已断开，sessionId={}，当前在线数={}", session.getId(), SESSIONS.size());
    }

    @OnError
    public void onError(Session session, Throwable error) {
        log.error("WebSocket 连接异常，sessionId={}",
                session != null ? session.getId() : "unknown", error);
        if (session != null) {
            SESSIONS.remove(session);
        }
    }

    /**
     * 异步广播告警数据给所有在线大屏客户端
     *
     * @param alertData 告警 VO 实体
     */
    public static void sendAlertNotification(Object alertData) {
        BROADCAST_EXECUTOR.execute(() -> {
            if (SESSIONS.isEmpty()) {
                log.debug("暂无在线大屏客户端，跳过 WebSocket 广播");
                return;
            }

            try {
                String message = OBJECT_MAPPER.writeValueAsString(alertData);
                int successCount = 0;

                for (Session session : SESSIONS) {
                    if (session.isOpen()) {
                        session.getAsyncRemote().sendText(message);
                        successCount++;
                    } else {
                        SESSIONS.remove(session);
                    }
                }

                log.info("告警 WebSocket 广播完成，推送客户端数={}", successCount);
            } catch (Exception e) {
                log.error("告警 WebSocket 广播失败", e);
            }
        });
    }
}
