package com.graphbuff.admin;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * The GraphBuff server users log in to, over Bolt, and how many failed logins a client
 * address may make in one window.
 */
@ConfigurationProperties("graphbuff")
public record GraphBuffProperties(String uri, Integer loginAttempts, Duration loginWindow) {

    public GraphBuffProperties {
        if (uri == null || uri.isBlank()) {
            uri = "bolt://localhost:7687";
        }
        if (loginAttempts == null || loginAttempts < 1) {
            loginAttempts = 5;
        }
        if (loginWindow == null || loginWindow.isNegative() || loginWindow.isZero()) {
            loginWindow = Duration.ofMinutes(5);
        }
    }
}
