# Export module

This is a fictional exercise project, not a production service.

The exporter writes a CSV file to a temporary path in the destination directory,
closes the file, then renames it to the final path. It never appends to an existing
export. A final file that already exists is an error, unless overwrite was
explicitly enabled by the caller.

The CSV uses UTF-8 without a byte-order mark. Fields containing commas, quotes or
line breaks are quoted; embedded quotes are doubled. The first row contains
column names. A zero-row query produces a header-only file, which is valid.

The exporter checks available space before starting, but this is not a reservation.
Disk space can run out while writing. A temporary file from an interrupted export
is not evidence of success. The caller should inspect the final file and the
record count before sharing it. This module does not upload files or send email.
