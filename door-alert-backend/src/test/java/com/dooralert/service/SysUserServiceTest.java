package com.dooralert.service;

import com.dooralert.dto.LoginDTO;
import com.dooralert.dto.SysUserDTO;
import com.dooralert.entity.SysUser;
import com.dooralert.mapper.SysUserMapper;
import com.dooralert.vo.LoginVO;
import com.dooralert.vo.SysUserVO;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 用户服务单元测试
 *
 * 使用 H2 内存数据库, 每个测试方法前自动初始化测试数据。
 */
@SpringBootTest
@ActiveProfiles("test")
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class SysUserServiceTest {

    @Autowired
    private SysUserService sysUserService;

    @Autowired
    private SysUserMapper sysUserMapper;

    @BeforeEach
    void setUp() {
        // 清空并插入测试数据
        sysUserMapper.delete(null);

        // 使用 BCrypt 加密的 "123456"
        org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder encoder =
                new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder();
        String encoded = encoder.encode("123456");

        SysUser admin = new SysUser();
        admin.setUsername("admin");
        admin.setPassword(encoded);
        admin.setNickname("系统管理员");
        admin.setRole("ADMIN");
        sysUserMapper.insert(admin);

        SysUser operator = new SysUser();
        operator.setUsername("security");
        operator.setPassword(encoded);
        operator.setNickname("安保值班员");
        operator.setRole("OPERATOR");
        sysUserMapper.insert(operator);
    }

    // ---- 登录测试 ----

    @Test
    @Order(1)
    @DisplayName("登录成功 — 正确的用户名和密码应返回 Token")
    void login_success_shouldReturnToken() {
        LoginDTO dto = new LoginDTO();
        dto.setUsername("admin");
        dto.setPassword("123456");

        LoginVO result = sysUserService.login(dto);

        assertNotNull(result, "登录结果不应为空");
        assertNotNull(result.getToken(), "Token 不应为空");
        assertFalse(result.getToken().isBlank(), "Token 不应为空串");
        assertEquals("admin", result.getUsername());
        assertEquals("ADMIN", result.getRole());
    }

    @Test
    @Order(2)
    @DisplayName("登录失败 — 密码错误应抛出异常")
    void login_wrongPassword_shouldThrow() {
        LoginDTO dto = new LoginDTO();
        dto.setUsername("admin");
        dto.setPassword("wrong_password");

        RuntimeException ex = assertThrows(RuntimeException.class,
                () -> sysUserService.login(dto));
        assertTrue(ex.getMessage().contains("用户名或密码错误"));
    }

    @Test
    @Order(3)
    @DisplayName("登录失败 — 用户名不存在应抛出异常")
    void login_userNotFound_shouldThrow() {
        LoginDTO dto = new LoginDTO();
        dto.setUsername("nonexistent");
        dto.setPassword("123456");

        assertThrows(RuntimeException.class, () -> sysUserService.login(dto));
    }

    // ---- 用户管理测试 ----

    @Test
    @Order(4)
    @DisplayName("新增安保账户 — 应成功且角色强制为 OPERATOR")
    void addUser_shouldCreateOperator() {
        SysUserDTO dto = new SysUserDTO();
        dto.setUsername("zhangsan");
        dto.setPassword("123456");
        dto.setNickname("值班员张三");

        boolean result = sysUserService.addUser(dto);
        assertTrue(result, "新增用户应成功");

        // 验证数据库中已存在
        List<SysUserVO> operators = sysUserService.listOperators();
        boolean found = operators.stream()
                .anyMatch(vo -> "zhangsan".equals(vo.getUsername()));
        assertTrue(found, "应能查到新增的用户");
    }

    @Test
    @Order(5)
    @DisplayName("新增重复用户名 — 应抛出异常")
    void addUser_duplicateUsername_shouldThrow() {
        SysUserDTO dto = new SysUserDTO();
        dto.setUsername("admin"); // 已存在
        dto.setPassword("123456");

        assertThrows(RuntimeException.class, () -> sysUserService.addUser(dto));
    }

    @Test
    @Order(6)
    @DisplayName("删除管理员 — 应被拒绝")
    void deleteAdmin_shouldThrow() {
        SysUser admin = sysUserMapper.selectList(null).stream()
                .filter(u -> "ADMIN".equals(u.getRole()))
                .findFirst().orElseThrow();

        RuntimeException ex = assertThrows(RuntimeException.class,
                () -> sysUserService.deleteUser(admin.getId()));
        assertTrue(ex.getMessage().contains("不允许删除管理员"));
    }

    @Test
    @Order(7)
    @DisplayName("重置密码 — 重置后应能用新密码登录")
    void resetPassword_shouldAllowLoginWithNewPassword() {
        SysUser operator = sysUserMapper.selectList(null).stream()
                .filter(u -> "OPERATOR".equals(u.getRole()))
                .findFirst().orElseThrow();

        boolean result = sysUserService.resetPassword(operator.getId());
        assertTrue(result, "重置密码应成功");

        // 用重置后的密码 123456 登录
        LoginDTO dto = new LoginDTO();
        dto.setUsername(operator.getUsername());
        dto.setPassword("123456");

        LoginVO loginResult = sysUserService.login(dto);
        assertNotNull(loginResult.getToken(), "重置密码后应能登录");
    }
}
