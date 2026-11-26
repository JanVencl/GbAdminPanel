package com.graphbuff.admin;

import java.util.Map;

import org.neo4j.driver.exceptions.AuthenticationException;
import org.neo4j.driver.exceptions.Neo4jException;
import org.neo4j.driver.exceptions.ServiceUnavailableException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import jakarta.servlet.http.HttpServletRequest;

/** Maps driver errors to JSON responses: {"code": ..., "message": ...}. */
@RestControllerAdvice
class ApiErrors {

    @ExceptionHandler(ServiceUnavailableException.class)
    ResponseEntity<Map<String, String>> unavailable(ServiceUnavailableException e) {
        return error(HttpStatus.SERVICE_UNAVAILABLE, e);
    }

    /** GraphBuff no longer accepts the session's login (password changed, token dropped): log out. */
    @ExceptionHandler(AuthenticationException.class)
    ResponseEntity<Map<String, String>> auth(AuthenticationException e, HttpServletRequest request) {
        var session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(Map.of("code", e.code() == null ? "" : e.code(), "message", "GraphBuff refused your login; log in again."));
    }

    @ExceptionHandler(Neo4jException.class)
    ResponseEntity<Map<String, String>> neo4j(Neo4jException e) {
        // Logged in, but GraphBuff does not let this user (or token) do it.
        boolean forbidden = e.code() != null && e.code().startsWith("Neo.ClientError.Security.");
        return error(forbidden ? HttpStatus.FORBIDDEN : HttpStatus.BAD_REQUEST, e);
    }

    private static ResponseEntity<Map<String, String>> error(HttpStatus status, Neo4jException e) {
        var code = e.code() == null ? "" : e.code();
        var message = e.getMessage() == null ? "" : e.getMessage();
        return ResponseEntity.status(status).body(Map.of("code", code, "message", message));
    }
}
