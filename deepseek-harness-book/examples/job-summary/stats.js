/** Validated duration statistics. Durations are sums, not elapsed wall time. */
export function summarizeJobs(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new TypeError('Expected a non-empty JSON array of jobs');
  }
  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)
      || typeof row.name !== 'string' || !row.name.trim()
      || typeof row.durationSeconds !== 'number'
      || !Number.isFinite(row.durationSeconds) || row.durationSeconds < 0) {
      throw new TypeError(`Invalid job at index ${index}: name must be non-empty and durationSeconds a finite non-negative number`);
    }
  }
  const values = rows.map(row => row.durationSeconds).sort((a, b) => a - b);
  const totalSeconds = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(totalSeconds)) throw new RangeError('Total duration overflow');
  const count = values.length;
  const middle = Math.floor(count / 2);
  return {
    count,
    totalSeconds,
    averageSeconds: totalSeconds / count,
    minSeconds: values[0],
    maxSeconds: values[count - 1],
    medianSeconds: count % 2 ? values[middle] : values[middle - 1] / 2 + values[middle] / 2,
    p95Seconds: values[Math.ceil(count * 0.95) - 1],
    percentileMethod: 'nearest-rank',
  };
}
