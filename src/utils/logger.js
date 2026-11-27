/**
 * Non-blocking Frontend Client Logger -> C:\homefood\client\log1..log10
 */
export function logClientEvent(level, event, details = {}) {
  try {
    const payload = JSON.stringify({
      level,
      event,
      url: window.location.pathname + window.location.hash,
      details
    });

    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon('/api/logs/client', blob);
    } else {
      fetch('/api/logs/client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
      }).catch(() => {});
    }
  } catch (e) {
    // Never block UI on logging failure
  }
}
