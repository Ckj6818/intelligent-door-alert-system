package com.dooralert.vo;

import lombok.Data;

/**
 * 下发给边缘端的算法参数。未配置时使用与 doorAlert.py 一致的默认值。
 */
@Data
public class EdgeConfigVO {

    /** 危险距离阈值（米），D_est 小于等于该值记为 DANGER */
    private Double dangerDistanceM = 1.5;

    /** 告警冷却秒数 */
    private Integer cooldownSec = 10;

    /** SFace 余弦相似度授权阈值 */
    private Double faceMatchThreshold = 0.363;

    /** 是否启用尾随检测 */
    private Boolean tailgateEnabled = true;
}
