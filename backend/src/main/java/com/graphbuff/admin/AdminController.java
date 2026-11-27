package com.graphbuff.admin;

import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.graphbuff.admin.GraphBuffService.QueryResult;

@RestController
@RequestMapping("/api")
class AdminController {

    private final GraphBuffService graphbuff;

    AdminController(GraphBuffService graphbuff) {
        this.graphbuff = graphbuff;
    }

    @GetMapping("/server")
    Map<String, Object> server() {
        return graphbuff.serverInfo();
    }

    @GetMapping("/databases")
    QueryResult databases() {
        return graphbuff.system("SHOW DATABASES");
    }

    @GetMapping("/databases/{database}/schema")
    Map<String, Object> schema(@PathVariable String database) {
        return graphbuff.schema(database);
    }

    @GetMapping("/aliases")
    QueryResult aliases() {
        return graphbuff.system("SHOW ALIASES FOR DATABASES");
    }

    @GetMapping("/users")
    QueryResult users() {
        return graphbuff.system("SHOW USERS");
    }

    @GetMapping("/roles")
    QueryResult roles() {
        return graphbuff.system("SHOW ROLES");
    }

    @GetMapping("/tokens")
    QueryResult tokens() {
        return graphbuff.system("SHOW TOKENS");
    }

    @GetMapping("/transactions")
    QueryResult transactions() {
        return graphbuff.system("SHOW TRANSACTIONS");
    }

    @PostMapping("/cypher")
    QueryResult cypher(@RequestBody CypherRequest request) {
        int maxRows = request.maxRows() == null || request.maxRows() <= 0
                ? GraphBuffService.DEFAULT_MAX_ROWS
                : request.maxRows();
        return graphbuff.run(request.database(), request.query(), request.params(), maxRows);
    }

    record CypherRequest(String database, String query, Map<String, Object> params, Integer maxRows) {
    }
}
