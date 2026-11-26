package com.graphbuff.admin;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Connection to the GraphBuff server, over Bolt. */
@ConfigurationProperties("graphbuff")
public record GraphBuffProperties(String uri, String username, String password) {
}
