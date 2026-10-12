package com.dooralert.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 授权人员新增 / 修改入参
 */
@Data
public class SysAuthorizedUserDTO {

    @NotBlank(message = "工号不能为空")
    @Size(max = 50, message = "工号长度不能超过50")
    private String userCode;

    @NotBlank(message = "姓名不能为空")
    @Size(max = 50, message = "姓名长度不能超过50")
    private String name;

    @Size(max = 100, message = "部门长度不能超过100")
    private String department;

    /** 人脸照片路径，如 /uploads/xxx.jpg */
    @Size(max = 500, message = "头像路径过长")
    private String avatarUrl;

    /** 1-启用 / 0-禁用，默认启用 */
    private Integer status;
}
