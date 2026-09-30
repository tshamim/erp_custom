import { Injectable, Logger } from '@nestjs/common';
import { config } from '../config';

export interface MailAddress {
  email: string;
  name?: string | null;
}

type Recipients = MailAddress | string | (MailAddress | string)[];

export interface MailMessage {
  to: Recipients;
  subject: string;
  /** Plain-text body; the HTML version is built from `blocks` when given. */
  text: string;
  html?: string;
  /** Mailtrap groups delivery statistics by category. */
  category?: string;
  replyTo?: string;
}

const list = (to: Recipients): MailAddress[] =>
  (Array.isArray(to) ? to : [to]).map((x) => (typeof x === 'string' ? { email: x } : x)).filter((x) => !!x.email);

/**
 * Outgoing email, through Mailtrap.
 *
 * Every call is fire-and-forget: a mail failure is logged and never breaks the business
 * operation that triggered it — a purchase order is still approved when the mail server is down.
 * With no API token configured the service logs what it would have sent, so development and
 * tests never reach the network.
 */
/** Unref'd so a queued mail never keeps the process (or a test run) alive. */
const sleep = (ms: number) =>
  new Promise((r) => {
    setTimeout(r, ms).unref?.();
  });

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  /** Sends are chained one after another: providers rate-limit per second, and mail is never urgent. */
  private queue: Promise<unknown> = Promise.resolve();
  private lastSentAt = 0;

  private get endpoint(): string {
    const m = config.mail;
    if (m.apiUrl) return m.apiUrl;
    // An inbox id means the Mailtrap testing inbox; without one, live sending.
    return m.inboxId ? `https://sandbox.api.mailtrap.io/api/send/${m.inboxId}` : 'https://send.api.mailtrap.io/api/send';
  }

  get enabled(): boolean {
    return config.mail.provider === 'mailtrap' && !!config.mail.token;
  }

  /** Sends in the background, behind the send queue. Awaiting it is optional and only useful in tests. */
  send(msg: MailMessage): Promise<boolean> {
    const run = this.queue.then(() => this.throttledDeliver(msg)).catch((e: Error) => {
      this.logger.error(`mail "${msg.subject}" failed: ${e.message}`);
      return false;
    });
    this.queue = run;
    return run;
  }

  /** Keeps one send per interval, and backs off when the provider still says too fast. */
  private async throttledDeliver(msg: MailMessage): Promise<boolean> {
    for (let attempt = 0; ; attempt++) {
      const wait = Math.max(0, config.mail.minIntervalMs * (attempt + 1) - (Date.now() - this.lastSentAt));
      if (wait) await sleep(wait);
      this.lastSentAt = Date.now();
      try {
        return await this.deliver(msg);
      } catch (e) {
        const rateLimited = e instanceof Error && /\b429\b/.test(e.message);
        if (!rateLimited || attempt >= 3) throw e;
      }
    }
  }

  /** One message per recipient, so nobody sees anybody else's address. */
  async sendEach(recipients: (MailAddress | string)[], build: (to: MailAddress) => Omit<MailMessage, 'to'>): Promise<void> {
    await Promise.all(list(recipients).map((r) => this.send({ ...build(r), to: r })));
  }

  private async deliver(msg: MailMessage): Promise<boolean> {
    const to = list(msg.to);
    if (!to.length) return false;
    if (!this.enabled) {
      this.logger.log(`[mail:${config.mail.provider}] to=${to.map((t) => t.email).join(', ')} · ${msg.subject}`);
      return false;
    }
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'api-token': config.mail.token },
      body: JSON.stringify({
        from: { email: config.mail.from.email, name: config.mail.from.name },
        to: to.map((t) => ({ email: t.email, name: t.name ?? undefined })),
        subject: msg.subject,
        text: msg.text,
        html: msg.html ?? undefined,
        category: msg.category ?? 'Eclectic ERP',
        headers: msg.replyTo || config.mail.replyTo ? { 'Reply-To': msg.replyTo ?? config.mail.replyTo! } : undefined,
      }),
    });
    if (!res.ok) throw new Error(`Mailtrap ${res.status}: ${(await res.text()).slice(0, 300)}`);
    this.logger.log(`mail sent to ${to.map((t) => t.email).join(', ')} · ${msg.subject}`);
    return true;
  }
}
