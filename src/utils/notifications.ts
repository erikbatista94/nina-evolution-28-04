// Central notification manager for inbound client messages

const notifiedMessageIds = new Set<string>();
const MAX_DEDUP_SIZE = 500;

// --- Permission ---
export function getNotificationStatus(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!('Notification' in window)) return 'unsupported';
  const result = await Notification.requestPermission();
  return result;
}

// --- Sound ---
export function playNotificationSound() {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = 800;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.2);
  } catch {
    // silently fail
  }
}

// --- Browser Notification ---
export function showBrowserNotification(
  contactName: string,
  messageBody: string,
  conversationId: string
) {
  if (getNotificationStatus() !== 'granted') return;

  const title = `Nova mensagem de ${contactName || 'Cliente'}`;
  const body = (messageBody || '').slice(0, 120) || '📎 Mídia recebida';

  try {
    const notification = new Notification(title, {
      body,
      icon: '/favicon.ico',
      tag: `msg-${conversationId}`, // collapses multiple from same conv
      renotify: true,
      silent: true, // we play our own sound
    });

    notification.onclick = () => {
      window.focus();
      // Navigate to the correct conversation
      const url = new URL(window.location.href);
      url.pathname = '/chat';
      url.searchParams.set('conv', conversationId);
      window.location.href = url.toString();
      notification.close();
    };

    // Auto close after 6s
    setTimeout(() => notification.close(), 6000);
  } catch {
    // Notification constructor can fail in some contexts
  }
}

// --- Deduplication ---
export function isMessageAlreadyNotified(messageId: string): boolean {
  return notifiedMessageIds.has(messageId);
}

export function markMessageNotified(messageId: string) {
  notifiedMessageIds.add(messageId);
  // Prevent unbounded growth
  if (notifiedMessageIds.size > MAX_DEDUP_SIZE) {
    const iter = notifiedMessageIds.values();
    for (let i = 0; i < 100; i++) {
      const v = iter.next().value;
      if (v) notifiedMessageIds.delete(v);
    }
  }
}

// --- Bulk seed (mark existing messages so they don't trigger on load) ---
export function seedNotifiedIds(ids: string[]) {
  ids.forEach(id => notifiedMessageIds.add(id));
}

// --- Visibility helpers ---
export function isPageHidden(): boolean {
  return document.visibilityState === 'hidden';
}
