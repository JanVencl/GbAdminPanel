package com.graphbuff.admin;

import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
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

    @GetMapping("/users")
    QueryResult users() {
        return graphbuff.system("SHOW USERS");
    }

    @GetMapping("/transactions")
    QueryResult transactions() {
        return graphbuff.system("SHOW TRANSACTIONS");
    }

    @PostMapping("/cypher")
    QueryResult cypher(@RequestBody CypherRequest request) {
        return graphbuff.run(request.database(), request.query(), request.params());
    }

    record CypherRequest(String database, String query, Map<String, Object> params) {
    }
}
