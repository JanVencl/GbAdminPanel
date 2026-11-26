package com.graphbuff.admin;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.neo4j.driver.Driver;
import org.neo4j.driver.Record;
import org.neo4j.driver.Session;
import org.neo4j.driver.SessionConfig;
import org.neo4j.driver.Value;
import org.neo4j.driver.summary.Plan;
import org.neo4j.driver.summary.ProfiledPlan;
import org.neo4j.driver.summary.ResultSummary;
import org.neo4j.driver.summary.SummaryCounters;
import org.neo4j.driver.types.Node;
import org.neo4j.driver.types.Path;
import org.neo4j.driver.types.Relationship;
import org.neo4j.driver.types.TypeSystem;
import org.springframework.stereotype.Service;

@Service
public class GraphBuffService {

    public static final String SYSTEM_DB = "system";
    public static final int DEFAULT_MAX_ROWS = 1000;

    private final Connections connections;
    private final GraphBuffProperties props;

    public GraphBuffService(Connections connections, GraphBuffProperties props) {
        this.connections = connections;
        this.props = props;
    }

    /** The server and the logged-in user, as found at login. */
    public Map<String, Object> serverInfo() {
        var c = connections.current();
        var out = new LinkedHashMap<String, Object>();
        out.put("uri", props.uri());
        out.put("user", c.user());
        out.put("roles", c.roles());
        out.put("address", c.address());
        out.put("agent", c.agent());
        out.put("protocolVersion", c.protocolVersion());
        return out;
    }

    /** Runs one auto-commit query (admin commands such as SHOW USERS need one), keeping at most maxRows rows. */
    public QueryResult run(String database, String query, Map<String, Object> params, int maxRows) {
        try (var session = session(database)) {
            return run(session, query, params, maxRows);
        }
    }

    public QueryResult run(String database, String query, Map<String, Object> params) {
        return run(database, query, params, DEFAULT_MAX_ROWS);
    }

    public QueryResult system(String query) {
        return run(SYSTEM_DB, query, Map.of());
    }

    /** What the object tree and the editor's autocomplete need to know about one database. */
    public Map<String, Object> schema(String database) {
        try (var session = session(database)) {
            var out = new LinkedHashMap<String, Object>();
            out.put("labels", column(run(session, "CALL db.labels() YIELD label RETURN label ORDER BY label", null, Integer.MAX_VALUE), "label"));
            out.put("relationshipTypes", column(run(session, "CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType ORDER BY relationshipType", null, Integer.MAX_VALUE), "relationshipType"));
            out.put("propertyKeys", column(run(session, "CALL db.propertyKeys() YIELD propertyKey RETURN propertyKey ORDER BY propertyKey", null, Integer.MAX_VALUE), "propertyKey"));
            out.put("indexes", run(session, "SHOW INDEXES", null, Integer.MAX_VALUE));
            out.put("constraints", run(session, "SHOW CONSTRAINTS", null, Integer.MAX_VALUE));
            return out;
        }
    }

    private Session session(String database) {
        Driver driver = connections.current().driver();
        return driver.session(database == null || database.isBlank()
                ? SessionConfig.defaultConfig()
                : SessionConfig.forDatabase(database));
    }

    private static QueryResult run(Session session, String query, Map<String, Object> params, int maxRows) {
        var started = System.nanoTime();
        var result = session.run(query, params == null ? Map.of() : params);
        List<String> keys = result.keys();
        var rows = new ArrayList<Map<String, Object>>();
        while (rows.size() < maxRows && result.hasNext()) {
            rows.add(toRow(result.next()));
        }
        boolean truncated = result.hasNext();
        var summary = result.consume();
        var elapsedMs = (System.nanoTime() - started) / 1_000_000;
        return new QueryResult(keys, rows, truncated, summary(summary, elapsedMs));
    }

    private static List<Object> column(QueryResult result, String key) {
        return result.rows().stream().map(r -> r.get(key)).toList();
    }

    private static Map<String, Object> summary(ResultSummary summary, long elapsedMs) {
        var out = new LinkedHashMap<String, Object>();
        out.put("queryType", summary.queryType() == null ? null : summary.queryType().name());
        out.put("elapsedMs", elapsedMs);
        out.put("counters", counters(summary.counters()));
        out.put("database", summary.database() == null ? null : summary.database().name());
        if (summary.hasProfile()) {
            out.put("plan", plan(summary.profile()));
            out.put("profiled", true);
        } else if (summary.hasPlan()) {
            out.put("plan", plan(summary.plan()));
            out.put("profiled", false);
        }
        return out;
    }

    /** An EXPLAIN or PROFILE plan as a tree of {operator, arguments, identifiers, children, rows?, dbHits?, timeNs?}. */
    private static Map<String, Object> plan(Plan plan) {
        var out = new LinkedHashMap<String, Object>();
        out.put("operator", plan.operatorType());
        var args = new LinkedHashMap<String, Object>();
        plan.arguments().forEach((k, v) -> args.put(k, toJson(v)));
        out.put("arguments", args);
        out.put("identifiers", plan.identifiers());
        if (plan instanceof ProfiledPlan p) {
            out.put("rows", p.records());
            out.put("dbHits", p.dbHits());
            out.put("timeNs", p.time());
        }
        out.put("children", plan.children().stream().map(GraphBuffService::plan).toList());
        return out;
    }

    /** The non-zero update counters, such as nodesCreated: 2. */
    private static Map<String, Integer> counters(SummaryCounters c) {
        var all = new LinkedHashMap<String, Integer>();
        all.put("nodesCreated", c.nodesCreated());
        all.put("nodesDeleted", c.nodesDeleted());
        all.put("relationshipsCreated", c.relationshipsCreated());
        all.put("relationshipsDeleted", c.relationshipsDeleted());
        all.put("propertiesSet", c.propertiesSet());
        all.put("labelsAdded", c.labelsAdded());
        all.put("labelsRemoved", c.labelsRemoved());
        all.put("indexesAdded", c.indexesAdded());
        all.put("indexesRemoved", c.indexesRemoved());
        all.put("constraintsAdded", c.constraintsAdded());
        all.put("constraintsRemoved", c.constraintsRemoved());
        all.put("systemUpdates", c.systemUpdates());
        all.values().removeIf(v -> v == 0);
        return all;
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

    public record QueryResult(List<String> columns, List<Map<String, Object>> rows, boolean truncated,
            Map<String, Object> summary) {
    }
}
