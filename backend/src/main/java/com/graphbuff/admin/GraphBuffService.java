package com.graphbuff.admin;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.neo4j.driver.Driver;
import org.neo4j.driver.Record;
import org.neo4j.driver.SessionConfig;
import org.neo4j.driver.Value;
import org.neo4j.driver.types.Node;
import org.neo4j.driver.types.Path;
import org.neo4j.driver.types.Relationship;
import org.neo4j.driver.types.TypeSystem;
import org.springframework.stereotype.Service;

@Service
public class GraphBuffService {

    public static final String SYSTEM_DB = "system";

    private final Driver driver;
    private final GraphBuffProperties props;

    public GraphBuffService(Driver driver, GraphBuffProperties props) {
        this.driver = driver;
        this.props = props;
    }

    public Map<String, Object> serverInfo() {
        org.neo4j.driver.summary.ServerInfo info;
        // The system database runs only admin commands, so ask the default one.
        try (var session = driver.session()) {
            info = session.run("RETURN 1").consume().server();
        }
        var out = new LinkedHashMap<String, Object>();
        out.put("uri", props.uri());
        out.put("user", props.username());
        out.put("address", info.address());
        out.put("agent", info.agent());
        out.put("protocolVersion", info.protocolVersion());
        return out;
    }

    /** Runs one auto-commit query; admin commands such as SHOW USERS need one. */
    public QueryResult run(String database, String query, Map<String, Object> params) {
        var config = database == null || database.isBlank()
                ? SessionConfig.defaultConfig()
                : SessionConfig.forDatabase(database);
        try (var session = driver.session(config)) {
            var result = session.run(query, params == null ? Map.of() : params);
            List<String> keys = result.keys();
            List<Map<String, Object>> rows = result.list(GraphBuffService::toRow);
            return new QueryResult(keys, rows);
        }
    }

    public QueryResult system(String query) {
        return run(SYSTEM_DB, query, Map.of());
    }

    private static Map<String, Object> toRow(Record record) {
        var row = new LinkedHashMap<String, Object>();
        for (var key : record.keys()) {
            row.put(key, toJson(record.get(key)));
        }
        return row;
    }

    /** Converts a driver value to plain, JSON-friendly Java objects. */
    static Object toJson(Value value) {
        var types = TypeSystem.getDefault();
        if (value.isNull()) {
            return null;
        }
        if (value.hasType(types.NODE())) {
            return node(value.asNode());
        }
        if (value.hasType(types.RELATIONSHIP())) {
            return relationship(value.asRelationship());
        }
        if (value.hasType(types.PATH())) {
            return path(value.asPath());
        }
        if (value.hasType(types.LIST())) {
            return value.asList(GraphBuffService::toJson);
        }
        if (value.hasType(types.MAP())) {
            return value.asMap(GraphBuffService::toJson);
        }
        return value.asObject();
    }

    private static Map<String, Object> node(Node n) {
        var out = new LinkedHashMap<String, Object>();
        out.put("elementId", n.elementId());
        out.put("labels", n.labels());
        out.put("properties", n.asMap(GraphBuffService::toJson));
        return out;
    }

    private static Map<String, Object> relationship(Relationship r) {
        var out = new LinkedHashMap<String, Object>();
        out.put("elementId", r.elementId());
        out.put("type", r.type());
        out.put("start", r.startNodeElementId());
        out.put("end", r.endNodeElementId());
        out.put("properties", r.asMap(GraphBuffService::toJson));
        return out;
    }

    private static Map<String, Object> path(Path p) {
        var nodes = new ArrayList<Object>();
        p.nodes().forEach(n -> nodes.add(node(n)));
        var rels = new ArrayList<Object>();
        p.relationships().forEach(r -> rels.add(relationship(r)));
        return Map.of("nodes", nodes, "relationships", rels);
    }

    public record QueryResult(List<String> columns, List<Map<String, Object>> rows) {
    }
}
