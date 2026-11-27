package com.graphbuff.admin;

import java.util.List;

import org.neo4j.driver.Driver;

import jakarta.servlet.http.HttpSessionBindingEvent;
import jakarta.servlet.http.HttpSessionBindingListener;

/**
 * One logged-in user's connection to GraphBuff, kept in their HTTP session. Every query
 * of that session runs as that user, so GraphBuff decides what they may do. The driver
 * is closed when the session ends: logout, timeout or a new login.
 */
public final class SessionConnection implements HttpSessionBindingListener {

    public static final String ATTRIBUTE = SessionConnection.class.getName();

    private final Driver driver;
    private final String user;
    private final List<String> roles;
    private final String agent;
    private final String address;
    private final String protocolVersion;
    private final boolean token;

    SessionConnection(Driver driver, String user, List<String> roles, String agent, String address,
            String protocolVersion, boolean token) {
        this.driver = driver;
        this.user = user;
        this.roles = List.copyOf(roles);
        this.agent = agent;
        this.address = address;
        this.protocolVersion = protocolVersion;
        this.token = token;
    }

    public Driver driver() {
        return driver;
    }

    public String user() {
        return user;
    }

    public List<String> roles() {
        return roles;
    }

    public String agent() {
        return agent;
    }

    public String address() {
        return address;
    }

    public String protocolVersion() {
        return protocolVersion;
    }

    /** Logged in with an API token rather than a password. */
    public boolean token() {
        return token;
    }

    @Override
    public void valueUnbound(HttpSessionBindingEvent event) {
        driver.close();
    }
}
