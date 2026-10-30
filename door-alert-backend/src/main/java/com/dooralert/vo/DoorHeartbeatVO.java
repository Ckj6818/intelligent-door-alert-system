package com.dooralert.vo;

import lombok.Builder;
import lombok.Data;

/**
 * 边缘心跳响应：在线确认 + 边缘算法参数热更新下发
 */
@Data
@Builder
public class DoorHeartbeatVO {

    private Boolean online;

    /** 边缘算法参数，随心跳返回供下一帧热更新 */
    private EdgeConfigVO edgeConfig;
}
