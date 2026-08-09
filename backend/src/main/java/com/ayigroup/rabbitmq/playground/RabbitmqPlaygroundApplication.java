package com.ayigroup.rabbitmq.playground;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class RabbitmqPlaygroundApplication {

    public static void main(String[] args) {
        SpringApplication.run(RabbitmqPlaygroundApplication.class, args);
    }
}
