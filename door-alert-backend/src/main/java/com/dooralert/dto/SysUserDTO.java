package com.dooralert.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 用户新增/修改 入参对象
 */
@Data
public class SysUserDTO {

    @NotBlank(message = "用户名不能为空")
    @Size(max = 50, message = "用户名长度不能超过50")
    private String username;

    @NotBlank(message = "密码不能为空")
    @Size(min = 6, max = 100, message = "密码长度须在6~100之间")
    private String password;

    @Size(max = 50, message = "昵称长度不能超过50")
    private String nickname;

    private String role;
}
