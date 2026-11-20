package com.dooralert.vo;

import lombok.Data;
import java.util.List;

/**
 * 下发给边缘端的算法与视频源参数。未配置时使用与 doorAlert.py 一致的默认值。
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

    /** YOLO 行人检测置信度阈值 (0.15 ~ 0.95) */
    private Double yoloConfThreshold = 0.45;

    /** 门前遮挡徘徊告警触发秒数 */
    private Double loiterSeconds = 10.0;

    /** 视频输入源：摄像头索引 ("0" / "1")、RTSP 流地址 ("rtsp://...") 或演示文件路径 */
    private String videoSource = "0";

    /** 归一化多边形 ROI 防区顶点列表 [[x1,y1], [x2,y2], ...]（坐标范围 0.0~1.0；为空则使用默认矩形） */
    private List<List<Double>> roiPolygon;
}
