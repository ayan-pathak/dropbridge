export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exp;
  return `${value >= 10 || exp === 0 ? Math.round(value) : value.toFixed(1)} ${units[exp]}`;
}

export function formatRelative(date: Date | null): string {
  if (!date) return 'just now';
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function expiryLabel(
  expiresAt: Date | null,
  keep: boolean,
  downloadedAt: Date | null,
): string {
  if (keep) return 'Kept';
  if (!expiresAt) return '';

  const remaining = expiresAt.getTime() - Date.now();
  if (remaining <= 0) return 'Deleting…';

  // A delivered file is on a minutes-long fuse, so days would read as "1d left"
  // right up until it vanishes. Say what is actually about to happen.
  if (downloadedAt) {
    const minutes = Math.ceil(remaining / 60_000);
    return minutes < 60
      ? `Delivered · gone in ${minutes}m`
      : `Delivered · gone in ${Math.ceil(minutes / 60)}h`;
  }

  return `${Math.ceil(remaining / 86_400_000)}d left`;
}
