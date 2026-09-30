import { config } from '../config';
import { MailService } from './mail.service';
import { eb3CaseUpdate, expiringDocuments, quotationSent, tenantUrl, userWelcome } from './templates';

describe('MailService', () => {
  const original = { ...config.mail };
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '{}' });
    global.fetch = fetchMock as unknown as typeof fetch;
    Object.assign(config.mail, original, { provider: 'mailtrap', token: 'test-token', inboxId: '', minIntervalMs: 0 });
  });

  afterEach(() => Object.assign(config.mail, original));

  it('sends nothing, and never throws, when no token is configured', async () => {
    Object.assign(config.mail, { token: '' });
    await expect(new MailService().send({ to: 'a@b.test', subject: 'Hi', text: 'Hi' })).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts to the live endpoint, or the testing inbox when one is set', async () => {
    const mail = new MailService();
    await mail.send({ to: 'a@b.test', subject: 'Hi', text: 'Hi' });
    expect(fetchMock.mock.calls[0][0]).toBe('https://send.api.mailtrap.io/api/send');

    Object.assign(config.mail, { inboxId: '4242' });
    await new MailService().send({ to: 'a@b.test', subject: 'Hi', text: 'Hi' });
    expect(fetchMock.mock.calls[1][0]).toBe('https://sandbox.api.mailtrap.io/api/send/4242');
  });

  it('carries the recipients, the token and the body', async () => {
    await new MailService().send({ to: [{ email: 'a@b.test', name: 'A' }, 'c@d.test'], subject: 'Hi', text: 'Body', category: 'Test' });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['api-token']).toBe('test-token');
    const body = JSON.parse(init.body);
    expect(body.to).toEqual([{ email: 'a@b.test', name: 'A' }, { email: 'c@d.test' }]);
    expect(body.subject).toBe('Hi');
    expect(body.category).toBe('Test');
  });

  it('swallows a provider failure so the business operation still succeeds', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' });
    await expect(new MailService().send({ to: 'a@b.test', subject: 'Hi', text: 'Hi' })).resolves.toBe(false);
  });

  it('retries when the provider says the sends are too fast', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'Too many emails per second' })
      .mockResolvedValue({ ok: true, status: 200, text: async () => '{}' });
    await expect(new MailService().send({ to: 'a@b.test', subject: 'Hi', text: 'Hi' })).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sends one message per recipient, so nobody sees the others', async () => {
    await new MailService().sendEach(['a@b.test', 'c@d.test'], () => ({ subject: 'Hi', text: 'Hi' }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const recipients = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body).to[0].email);
    expect(recipients.sort()).toEqual(['a@b.test', 'c@d.test']);
  });
});

describe('templates', () => {
  it('links to the company sign-in page, with the subdomain only when they are in use', () => {
    Object.assign(config.mail, { appUrl: 'https://erp.example.com', useSubdomains: false });
    expect(tenantUrl('acme')).toBe('https://erp.example.com');
    Object.assign(config.mail, { useSubdomains: true });
    expect(tenantUrl('acme')).toBe('https://acme.erp.example.com');
    Object.assign(config.mail, { useSubdomains: false });
  });

  it('never puts a password in a welcome mail', () => {
    const m = userWelcome({ company: 'Acme', slug: 'acme', name: 'Karim', email: 'k@acme.test', roles: ['Site Engineer'] });
    expect(m.text).toContain('acme');
    expect(m.text).toContain('Site Engineer');
    expect(m.text.toLowerCase()).not.toContain('password:');
  });

  it('escapes anything a user typed into the HTML', () => {
    const m = quotationSent({
      company: 'Acme',
      clientName: '<script>alert(1)</script>',
      no: 'QTN-1',
      title: 'Road works',
      date: '2026-09-30',
      subtotal: '1000',
      vatAmount: '75',
      total: '1075',
    });
    expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('&lt;script&gt;');
  });

  it('shows expired papers differently from ones still running', () => {
    const m = expiringDocuments({
      company: 'Acme',
      slug: 'acme',
      name: 'Karim',
      documents: [
        { title: 'Trade Licence', expiryDate: '2026-01-01', daysLeft: -30 },
        { title: 'Insurance', expiryDate: '2026-10-20', daysLeft: 20 },
      ],
    });
    expect(m.text).toContain('Expired');
    expect(m.text).toContain('20 days left');
  });

  it('tells an EB-3 candidate the milestone in words, with a warning about fees', () => {
    const m = eb3CaseUpdate({
      company: 'Acme',
      candidateName: 'Sohel',
      caseNo: 'EB3-1',
      stage: 'interview_scheduled',
      stageDate: '2026-09-30',
      employer: 'Midwest Foods',
      interviewDate: '2026-11-04',
      consulate: 'US Embassy Dhaka',
    });
    expect(m.subject).toContain('interview has been scheduled');
    expect(m.text).toContain('US Embassy Dhaka');
    expect(m.text).toContain('no fee is ever requested by email');
  });
});
