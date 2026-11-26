package com.graphbuff.admin;

import org.neo4j.driver.AuthTokens;
import org.neo4j.driver.Driver;
import org.neo4j.driver.GraphDatabase;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
class DriverConfig {

    /** Creating the driver does not connect; the first query does. */
    @Bean(destroyMethod = "close")
    Driver driver(GraphBuffProperties props) {
        return GraphDatabase.driver(props.uri(), AuthTokens.basic(props.username(), props.password()));
    }
}
