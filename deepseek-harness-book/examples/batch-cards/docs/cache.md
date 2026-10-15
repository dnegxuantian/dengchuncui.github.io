# Cache module

This is a fictional exercise project, not a production service.

The cache keeps parsed template files in memory. A key is the canonical path plus
the file modification time. Entries expire after 60 seconds. The default limit
is 128 entries; least recently used entries are evicted first. Restarting the
process drops all entries. There is no disk cache and no sharing between hosts.

Configure `CACHE_MAX_ENTRIES=64` to halve the number of entries. This is an entry
count, not a byte limit. One large template may still consume substantial memory.
The loader rejects templates larger than 2 MiB before parsing them.

If edits seem invisible, compare the path and modification time in the debug log.
Disabling the cache is useful for diagnosis but does not fix a wrong path.
