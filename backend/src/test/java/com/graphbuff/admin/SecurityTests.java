package com.graphbuff.admin;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;

// Nothing listens on port 1, so a login with right-looking input fails to connect.
@SpringBootTest(properties = { "graphbuff.uri=bolt://127.0.0.1:1", "graphbuff.login-attempts=2" })
@AutoConfigureMockMvc
class SecurityTests {

    @Autowired
    MockMvc mvc;

    @Test
    void apiNeedsLogin() throws Exception {
        mvc.perform(get("/api/databases")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/server")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/cypher").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"query\":\"RETURN 1\"}"))
                .andExpect(status().isUnauthorized());
    }

    // csrf() in other tests swaps the CSRF repository of the shared context for a test one
    // that writes no cookie, so this test needs a fresh context.
    @Test
    @DirtiesContext(methodMode = DirtiesContext.MethodMode.BEFORE_METHOD)
    void sessionIsPublicAndSetsCsrfCookie() throws Exception {
        mvc.perform(get("/api/session"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.authenticated").value(false))
                .andExpect(jsonPath("$.uri").value("bolt://127.0.0.1:1"))
                .andExpect(cookie().exists("XSRF-TOKEN"));
    }

    @Test
    void postsNeedCsrfToken() throws Exception {
        mvc.perform(post("/api/login").contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"a\",\"password\":\"b\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/logout")).andExpect(status().isForbidden());
    }

    @Test
    void loginNeedsCredentials() throws Exception {
        mvc.perform(post("/api/login").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"username\":\"a\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void loginReportsUnreachableServer() throws Exception {
        mvc.perform(post("/api/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"a\",\"password\":\"b\"}"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.message").exists());
    }

    @Test
    void logoutWithoutSessionIsFine() throws Exception {
        mvc.perform(post("/api/logout").with(csrf())).andExpect(status().isUnauthorized());
    }
}
