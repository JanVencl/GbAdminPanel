package com.graphbuff.admin;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class GbAdminPanelApplication {

    public static void main(String[] args) {
        SpringApplication.run(GbAdminPanelApplication.class, args);
    }
}
