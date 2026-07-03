package com.dooralert.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.dooralert.entity.SysUser;
import com.dooralert.mapper.SysUserMapper;
import com.dooralert.service.SysUserService;
import org.springframework.stereotype.Service;

@Service
public class SysUserServiceImpl extends ServiceImpl<SysUserMapper, SysUser> implements SysUserService {
}
