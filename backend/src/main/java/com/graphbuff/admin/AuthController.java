package com.graphbuff.admin;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import org.neo4j.driver.AuthToken;
import org.neo4j.driver.AuthTokens;
import org.neo4j.driver.Config;
import org.neo4j.driver.Driver;
import org.neo4j.driver.GraphDatabase;
import org.neo4j.driver.SessionConfig;
import org.neo4j.driver.Value;
import org.neo4j.driver.exceptions.SecurityException;
import org.neo4j.driver.exceptions.ServiceUnavailableException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/** Logs users in with their GraphBuff account or API token, and out. */
@RestController
@RequestMapping("/api")
class AuthController {

    private final GraphBuffProperties props;
    private final LoginThrottle throttle;
    private final SecurityContextRepository contexts;

    AuthController(GraphBuffProperties props, LoginThrottle throttle, SecurityContextRepository contexts) {
        this.props = props;
        this.throttle = throttle;
        this.contexts = contexts;
    }

    /** Who is logged in, if anyone. Also hands out the CSRF cookie the next POST needs. */
    @GetMapping("/session")
    Map<String, Object> session(HttpServletRequest request, CsrfToken csrf) {
        csrf.getToken(); // makes the deferred token write its cookie
        var out = new LinkedHashMap<String, Object>();
        out.put("uri", props.uri());
        var s = request.getSession(false);
        var c = s == null ? null : s.getAttribute(SessionConnection.ATTRIBUTE);
        out.put("authenticated", c instanceof SessionConnection);
        if (c instanceof SessionConnection connection) {
            out.putAll(describe(connection));
        }
        return out;
    }

    @PostMapping("/login")
    ResponseEntity<Map<String, Object>> login(@RequestBody LoginRequest body, HttpServletRequest request,
            HttpServletResponse response) {
        var client = request.getRemoteAddr();
        var wait = throttle.retryAfter(client);
        if (!wait.isZero() && !wait.isNegative()) {
            var seconds = Math.max(1, wait.toSeconds());
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .header(HttpHeaders.RETRY_AFTER, String.valueOf(seconds))
                    .body(Map.of("message", "Too many failed logins. Try again in " + seconds + " s."));
        }

        boolean useToken = body.token() != null && !body.token().isBlank();
        if (!useToken && (body.username() == null || body.username().isBlank() || body.password() == null)) {
            return ResponseEntity.badRequest().body(Map.of("message", "Enter a user name and password, or an API token."));
        }
        AuthToken auth = useToken ? AuthTokens.bearer(body.token().trim()) : AuthTokens.basic(body.username().trim(), body.password());

        Driver driver = GraphDatabase.driver(props.uri(), auth, Config.builder()
                .withMaxConnectionPoolSize(4)
                .withConnectionTimeout(5, TimeUnit.SECONDS)
                .withConnectionAcquisitionTimeout(15, TimeUnit.SECONDS)
                .withUserAgent("GbAdminPanel")
                .build());
        SessionConnection connection;
        try (var session = driver.session(SessionConfig.forDatabase(GraphBuffService.SYSTEM_DB))) {
            var result = session.run("SHOW CURRENT USER");
            var record = result.single();
            var server = result.consume().server();
            List<String> roles = new ArrayList<>(record.get("roles").asList(Value::asString));
            connection = new SessionConnection(driver, record.get("user").asString(), roles, server.agent(),
                    server.address(), server.protocolVersion(), useToken);
        } catch (SecurityException e) { // includes AuthenticationException
            driver.close();
            throttle.failed(client);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", useToken ? "The token was refused." : "Wrong user name or password."));
        } catch (ServiceUnavailableException e) {
            driver.close();
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("message", "Cannot reach GraphBuff at " + props.uri() + "."));
        } catch (RuntimeException e) {
            driver.close();
            throw e;
        }
        throttle.succeeded(client);

        // A fresh session for every login, so an earlier session id cannot be reused.
        var old = request.getSession(false);
        if (old != null) {
            old.invalidate();
        }
        var session = request.getSession(true);
        session.setAttribute(SessionConnection.ATTRIBUTE, connection);

        var authorities = connection.roles().stream().map(r -> new SimpleGrantedAuthority("ROLE_" + r)).toList();
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(connection.user(), null, authorities));
        SecurityContextHolder.setContext(context);
        contexts.saveContext(context, request, response);

        var out = new LinkedHashMap<String, Object>();
        out.put("uri", props.uri());
        out.put("authenticated", true);
        out.putAll(describe(connection));
        return ResponseEntity.ok(out);
    }

    @PostMapping("/logout")
    ResponseEntity<Void> logout(HttpServletRequest request) {
        var session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        SecurityContextHolder.clearContext();
        return ResponseEntity.noContent().build();
    }

    private static Map<String, Object> describe(SessionConnection c) {
        var out = new LinkedHashMap<String, Object>();
        out.put("user", c.user());
        out.put("roles", c.roles());
        out.put("token", c.token());
        out.put("agent", c.agent());
        out.put("address", c.address());
        out.put("protocolVersion", c.protocolVersion());
        return out;
    }

    record LoginRequest(String username, String password, String token) {
    }
}
