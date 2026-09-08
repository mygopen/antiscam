# Legal entity synchronization

The weekly/manual GitHub job downloads the complete tax CSV and required court
CSVs, selects mapped entities, and validates both sources before publishing.

Each source has up to three attempts (two retries), with 5/10 second backoff.
Connection/response headers have a 60 second limit; a body read may be idle for
120 seconds. An entire attempt is capped at 10 minutes. Successful data transfer
resets the idle deadline, not the total deadline. HTTP 408, 429 and 5xx responses
are retried; other HTTP errors fail immediately.

JSON logs include source URL, attempt, bytes, row count and elapsed time, with
progress updates every 30 seconds during transfer. They do not log record contents.
Each attempt owns its selected records: failed partial downloads cannot leak into
the next attempt. Only a fully validated module is atomically renamed into place.

The Actions summary records download/validation status. A failed run keeps the
previous published data; it does not mark it as newly verified. Publication is a
separate commit step and can still fail independently. Use a fresh manual run on
main to test fixes; re-running an old failed run would use its old commit.
