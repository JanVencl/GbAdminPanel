package com.graphbuff.admin;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Slows down password guessing: after {@code loginAttempts} failed logins from one client
 * address within {@code loginWindow}, further logins from it are refused until the oldest
 * failure leaves the window. A successful login clears the address.
 */
@Component
public class LoginThrottle {

    private final int attempts;
    private final Duration window;
    private final Clock clock;
    private final Map<String, Deque<Instant>> failures = new ConcurrentHashMap<>();

    @Autowired
    public LoginThrottle(GraphBuffProperties props) {
        this(props.loginAttempts(), props.loginWindow(), Clock.systemUTC());
    }

    LoginThrottle(int attempts, Duration window, Clock clock) {
        this.attempts = attempts;
        this.window = window;
        this.clock = clock;
    }

    /** How long the address must wait before it may try again; zero if it may now. */
    public Duration retryAfter(String address) {
        var times = failures.get(address);
        if (times == null) {
            return Duration.ZERO;
        }
        synchronized (times) {
            prune(times);
            if (times.size() < attempts) {
                return Duration.ZERO;
            }
            return Duration.between(clock.instant(), times.peekFirst().plus(window));
        }
    }

    public void failed(String address) {
        var times = failures.computeIfAbsent(address, a -> new ArrayDeque<>());
        synchronized (times) {
            prune(times);
            times.addLast(clock.instant());
        }
        // Forget addresses whose failures have all expired, so the map stays small.
        if (failures.size() > 10_000) {
            failures.values().removeIf(t -> {
                synchronized (t) {
                    prune(t);
                    return t.isEmpty();
                }
            });
        }
    }

    public void succeeded(String address) {
        failures.remove(address);
    }

    private void prune(Deque<Instant> times) {
        var cutoff = clock.instant().minus(window);
        while (!times.isEmpty() && !times.peekFirst().isAfter(cutoff)) {
            times.removeFirst();
        }
    }
}
