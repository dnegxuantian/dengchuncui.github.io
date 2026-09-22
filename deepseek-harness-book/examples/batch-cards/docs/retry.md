# Retry module

This is a fictional exercise project, not a production service.

The client retries HTTP GET requests after 429, 502 and 503 responses. It does not
retry POST requests automatically. A timeout before receiving headers is retried
for GET only. A broken response stream is returned as an error to the caller;
the retry module never joins bytes from two responses.

`RETRY_ATTEMPTS=3` means three total attempts, including the first request.
The delays before attempts two and three are 200 ms and 800 ms. Retry-After is
honored when it is a valid non-negative number of seconds, capped at 30 seconds.
Cancellation aborts both an active request and a pending delay.

Retries do not guarantee success. Check the final response and correlate attempt
numbers when investigating repeated calls. An HTTP 200 response still needs
application-level validation.
