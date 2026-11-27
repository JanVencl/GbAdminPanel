package com.graphbuff.admin;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;

class LoginThrottleTests {

    /** A clock the test moves by hand. */
    static final class ManualClock extends Clock {
        Instant now = Instant.parse("2026-01-01T00:00:00Z");

        @Override
        public Instant instant() {
            return now;
        }

        @Override
        public java.time.ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }
    }

    @Test
    void blocksAfterTooManyFailuresUntilTheyExpire() {
        var clock = new ManualClock();
        var throttle = new LoginThrottle(3, Duration.ofMinutes(5), clock);
        for (int i = 0; i < 3; i++) {
            assertThat(throttle.retryAfter("1.2.3.4")).isZero();
            throttle.failed("1.2.3.4");
            clock.now = clock.now.plusSeconds(10);
        }
        // Three failures at 0 s, 10 s, 20 s; now 30 s: blocked until the first expires at 300 s.
        assertThat(throttle.retryAfter("1.2.3.4")).isEqualTo(Duration.ofSeconds(270));
        assertThat(throttle.retryAfter("5.6.7.8")).isZero();

        clock.now = Instant.parse("2026-01-01T00:05:00Z");
        assertThat(throttle.retryAfter("1.2.3.4")).isZero();
    }

    @Test
    void successClearsTheAddress() {
        var throttle = new LoginThrottle(1, Duration.ofMinutes(5), new ManualClock());
        throttle.failed("1.2.3.4");
        assertThat(throttle.retryAfter("1.2.3.4")).isPositive();
        throttle.succeeded("1.2.3.4");
        assertThat(throttle.retryAfter("1.2.3.4")).isZero();
    }
}
