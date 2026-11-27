package com.graphbuff.admin;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;

/**
 * Users log in with their GraphBuff account through {@link AuthController}; the session
 * cookie then authenticates every /api call. State-changing requests need the CSRF token
 * from the XSRF-TOKEN cookie in the X-XSRF-TOKEN header.
 */
@Configuration
class SecurityConfig {

    @Bean
    SecurityContextRepository securityContextRepository() {
        return new HttpSessionSecurityContextRepository();
    }

    /** Logins go through AuthController only; this stops Spring Boot making a default user. */
    @Bean
    AuthenticationManager noAuthenticationManager() {
        return authentication -> {
            throw new BadCredentialsException("Log in through /api/login");
        };
    }

    @Bean
    SecurityFilterChain api(HttpSecurity http, SecurityContextRepository contexts) throws Exception {
        http
                .authorizeHttpRequests(a -> a
                        .requestMatchers("/api/session", "/api/login").permitAll()
                        .requestMatchers("/api/**").authenticated()
                        .anyRequest().permitAll())
                .csrf(csrf -> csrf.spa())
                .securityContext(c -> c.securityContextRepository(contexts))
                .exceptionHandling(e -> e.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .requestCache(AbstractHttpConfigurer::disable);
        return http.build();
    }
}
