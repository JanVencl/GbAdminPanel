package com.graphbuff.admin;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.server.ResponseStatusException;

/** Finds the GraphBuff connection of the user making the current request. */
@Component
public class Connections {

    public SessionConnection current() {
        var attrs = RequestContextHolder.getRequestAttributes();
        var connection = attrs == null ? null
                : attrs.getAttribute(SessionConnection.ATTRIBUTE, RequestAttributes.SCOPE_SESSION);
        if (connection instanceof SessionConnection c) {
            return c;
        }
        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not logged in");
    }
}
