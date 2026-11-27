package com.graphbuff.admin;

import java.util.Map;

import org.neo4j.driver.exceptions.AuthenticationException;
import org.neo4j.driver.exceptions.Neo4jException;
import org.neo4j.driver.exceptions.ServiceUnavailableException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Maps driver errors to JSON responses: {"code": ..., "message": ...}. */
@RestControllerAdvice
class ApiErrors {

    @ExceptionHandler(ServiceUnavailableException.class)
    ResponseEntity<Map<String, String>> unavailable(ServiceUnavailableException e) {
        return error(HttpStatus.SERVICE_UNAVAILABLE, e);
    }

    @ExceptionHandler(AuthenticationException.class)
    ResponseEntity<Map<String, String>> auth(AuthenticationException e) {
        return error(HttpStatus.BAD_GATEWAY, e);
    }

    @ExceptionHandler(Neo4jException.class)
    ResponseEntity<Map<String, String>> neo4j(Neo4jException e) {
        return error(HttpStatus.BAD_REQUEST, e);
    }

    private static ResponseEntity<Map<String, String>> error(HttpStatus status, Neo4jException e) {
        var code = e.code() == null ? "" : e.code();
        var message = e.getMessage() == null ? "" : e.getMessage();
        return ResponseEntity.status(status).body(Map.of("code", code, "message", message));
    }
}
