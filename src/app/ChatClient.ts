import type { ChatMessage, ChatPlace, ChatUser } from '../core/chat/ChatText';
import type { ChatBackend, SendResult } from '../ui/Chat';

export interface ChatEvents {
  /** New or backfilled messages (may repeat ids; the panel de-duplicates). `backfill` marks history loads. */
  messages(list: ChatMessage[], backfill: boolean): void;
  presence(online: ChatUser[]): void;
  status(live: boolean): void;
}

/**
 * Talks to the Falchion server's chat: history from /api/chat, live messages and presence
 * from the /api/chat/stream SSE stream (reconnecting with backoff), posts with the CSRF header.
 */
export class ChatClient implements ChatBackend {
  private es: EventSource | null = null;
  private retryMs = 1_000;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly events: ChatEvents, private readonly base = './api') {}

  start(): void {
    this.connect();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.es?.close();
    this.es = null;
  }

  private connect(): void {
    this.timer = null;
    const es = new EventSource(`${this.base}/chat/stream`, { withCredentials: true });
    this.es = es;
    es.addEventListener('open', () => {
      this.retryMs = 1_000;
      this.events.status(true);
      void this.backfill(); // also fills any gap after a reconnect
    });
    es.addEventListener('message', (e) => this.events.messages([JSON.parse((e as MessageEvent).data) as ChatMessage], false));
    es.addEventListener('presence', (e) => this.events.presence((JSON.parse((e as MessageEvent).data) as { online: ChatUser[] }).online));
    es.addEventListener('error', () => {
      if (this.es !== es) return; // stopped or replaced
      this.events.status(false);
      // The browser retries by itself while CONNECTING; a CLOSED stream (e.g. a 401 or a deploy) needs us.
      if (es.readyState !== EventSource.CLOSED || this.timer) return;
      es.close();
      this.timer = setTimeout(() => this.connect(), this.retryMs);
      this.retryMs = Math.min(30_000, this.retryMs * 2);
    });
  }

  private async backfill(): Promise<void> {
    try {
      const res = await fetch(`${this.base}/chat`, { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) return;
      const body = (await res.json()) as { global: ChatMessage[]; dms: ChatMessage[]; online: ChatUser[] };
      this.events.messages([...body.global, ...body.dms], true);
      this.events.presence(body.online);
    } catch {
      // Offline: the stream reconnects and backfills again.
    }
  }

  async send(to: string, text: string, mentions: string[], places: ChatPlace[]): Promise<SendResult> {
    try {
      const res = await fetch(`${this.base}/chat`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Falchion': '1' },
        body: JSON.stringify({ to, text, mentions, places }),
      });
      const body = await res.json().catch(() => ({}));
      return res.ok ? { ok: true, message: body as ChatMessage } : { ok: false, error: String(body.error ?? `failed (${res.status})`) };
    } catch {
      return { ok: false, error: 'offline: message not sent' };
    }
  }
}
