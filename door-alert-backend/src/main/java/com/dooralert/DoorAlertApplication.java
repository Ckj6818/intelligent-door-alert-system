package com.dooralert;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@MapperScan("com.dooralert.mapper")
public class DoorAlertApplication {

    public static void main(String[] args) {
        SpringApplication.run(DoorAlertApplication.class, args);
    }

}
