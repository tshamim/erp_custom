import { config } from '../config';
import type { MailMessage } from './mail.service';

type Built = Omit<MailMessage, 'to'>;

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const money = (v: string | number) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v));

const date = (v?: string | null) =>
  v ? new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/** The company's own sign-in address: its subdomain when one is configured, else the shared URL. */
export const tenantUrl = (slug?: string) => {
  const base = config.mail.appUrl.replace(/\/$/, '');
  if (!slug || !config.mail.useSubdomains) return base;
  return base.replace(/^(https?:\/\/)/, `$1${slug}.`);
};

/**
 * One plain layout for every message: a heading, paragraphs, an optional table of
 * label/value pairs and one action link. Kept deliberately simple so it renders the same
 * in Gmail, Outlook and a phone.
 */
function layout(o: { heading: string; intro: string[]; rows?: [string, string][]; action?: { label: string; url: string }; outro?: string[] }): { html: string; text: string } {
  const rows = (o.rows ?? []).filter(([, v]) => v !== undefined && v !== null && v !== '');
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:10px;border:1px solid #e2e8f0">
      <tr><td style="padding:20px 24px;border-bottom:1px solid #e2e8f0;font-weight:600;font-size:15px">${esc(config.mail.brand)}</td></tr>
      <tr><td style="padding:24px">
        <h1 style="margin:0 0 12px;font-size:19px;line-height:1.35">${esc(o.heading)}</h1>
        ${o.intro.map((p) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#334155">${esc(p)}</p>`).join('')}
        ${
          rows.length
            ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:4px 0 16px;font-size:14px">${rows
                .map(
                  ([k, v]) =>
                    `<tr><td style="padding:6px 0;color:#64748b;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0 6px 16px;text-align:right;font-weight:500">${esc(v)}</td></tr>`,
                )
                .join('')}</table>`
            : ''
        }
        ${
          o.action
            ? `<p style="margin:0 0 16px"><a href="${esc(o.action.url)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px;font-weight:500">${esc(o.action.label)}</a></p>
               <p style="margin:0 0 12px;font-size:12px;color:#94a3b8;word-break:break-all">${esc(o.action.url)}</p>`
            : ''
        }
        ${(o.outro ?? []).map((p) => `<p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:#64748b">${esc(p)}</p>`).join('')}
      </td></tr>
      <tr><td style="padding:14px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8">Sent automatically by ${esc(config.mail.brand)}. Please do not reply to this address.</td></tr>
    </table>
  </td></tr></table></body></html>`;

  const text = [
    o.heading,
    '',
    ...o.intro,
    ...(rows.length ? ['', ...rows.map(([k, v]) => `${k}: ${v}`)] : []),
    ...(o.action ? ['', `${o.action.label}: ${o.action.url}`] : []),
    ...(o.outro?.length ? ['', ...o.outro] : []),
    '',
    `Sent automatically by ${config.mail.brand}.`,
  ].join('\n');

  return { html, text };
}

const build = (subject: string, category: string, parts: Parameters<typeof layout>[0]): Built => ({ subject, category, ...layout(parts) });

// ---------------- platform ----------------

export const tenantWelcome = (o: { company: string; slug: string; adminName: string; plan: string; modules: string[] }): Built =>
  build(`Your ${config.mail.brand} account for ${o.company} is ready`, 'Tenant welcome', {
    heading: `Welcome to ${config.mail.brand}, ${o.adminName}`,
    intro: [
      `${o.company} now has its own ${config.mail.brand} workspace, with its own database. You are its first administrator, so you can add your colleagues and decide what each of them may see.`,
      'Sign in with the Company ID below, your email address, and the password that was set for you.',
    ],
    rows: [
      ['Company', o.company],
      ['Company ID', o.slug],
      ['Plan', o.plan],
      ['Modules enabled', o.modules.join(', ')],
    ],
    action: { label: 'Sign in', url: `${tenantUrl(o.slug)}/login` },
    outro: ['Please change your password after you first sign in, from your own profile.'],
  });

export const supportSignedIn = (o: { company: string; slug: string; platformAdmin: string; reason: string; userEmail: string; at: string }): Built =>
  build(`Support signed in to ${o.company}`, 'Support access', {
    heading: 'A support session was opened on your account',
    intro: [
      `${o.platformAdmin} signed in to ${o.company} as ${o.userEmail} to help with a support request. The session lasts one hour and everything done during it is recorded in your audit trail under that name.`,
      'If you did not ask for support, reply to your account manager straight away.',
    ],
    rows: [
      ['Support engineer', o.platformAdmin],
      ['Signed in as', o.userEmail],
      ['Reason given', o.reason],
      ['When', o.at],
    ],
    action: { label: 'Open the audit trail', url: `${tenantUrl(o.slug)}/admin/audit` },
  });

// ---------------- users ----------------

export const userWelcome = (o: { company: string; slug: string; name: string; email: string; roles: string[] }): Built =>
  build(`You have been added to ${o.company} on ${config.mail.brand}`, 'User welcome', {
    heading: `Welcome, ${o.name}`,
    intro: [
      `An administrator at ${o.company} has created an account for you. Sign in with the Company ID, your email address and the password they gave you.`,
    ],
    rows: [
      ['Company ID', o.slug],
      ['Email', o.email],
      ['Your roles', o.roles.length ? o.roles.join(', ') : 'No role yet — ask your administrator'],
    ],
    action: { label: 'Sign in', url: `${tenantUrl(o.slug)}/login` },
    outro: ['Change the password to one only you know, as soon as you sign in.'],
  });

export const passwordChanged = (o: { company: string; slug: string; name: string; by: string }): Built =>
  build('Your password was changed', 'Security', {
    heading: `${o.name}, your password was changed`,
    intro: [
      `The password for your ${o.company} account was changed by ${o.by}. You have been signed out everywhere and will need the new password to sign in again.`,
      'If you were not expecting this, contact your administrator immediately.',
    ],
    action: { label: 'Sign in', url: `${tenantUrl(o.slug)}/login` },
  });

// ---------------- quotations ----------------

export const quotationSent = (o: {
  company: string;
  clientName: string;
  no: string;
  title: string;
  date: string;
  validUntil?: string | null;
  subtotal: string;
  vatAmount: string;
  total: string;
  contact?: string | null;
}): Built =>
  build(`Quotation ${o.no} from ${o.company}`, 'Quotation', {
    heading: `Quotation ${o.no} — ${o.title}`,
    intro: [
      `Dear ${o.clientName}, thank you for the opportunity to quote. Our offer for ${o.title} is summarised below; the priced bill of quantities is attached to the quotation in our system and can be sent on request.`,
    ],
    rows: [
      ['Quotation no.', o.no],
      ['Date', date(o.date)],
      ['Valid until', date(o.validUntil)],
      ['Work value', `BDT ${money(o.subtotal)}`],
      ['VAT', `BDT ${money(o.vatAmount)}`],
      ['Total', `BDT ${money(o.total)}`],
    ],
    outro: [o.contact ? `For anything you would like changed, please reply to ${o.contact}.` : 'Please let us know if you would like anything changed.'],
  });

// ---------------- compliance ----------------

export const expiringDocuments = (o: { company: string; slug: string; name: string; documents: { title: string; docNo?: string | null; expiryDate?: string | null; daysLeft: number }[] }): Built =>
  build(`${o.documents.length} company document${o.documents.length === 1 ? '' : 's'} need attention`, 'Compliance', {
    heading: 'Documents expired or expiring soon',
    intro: [`${o.name}, these papers of ${o.company} have expired or expire within the next 30 days. A lapsed licence can cost a tender, so please renew them in good time.`],
    rows: o.documents.map(
      (d) => [`${d.title}${d.docNo ? ` (${d.docNo})` : ''}`, d.daysLeft < 0 ? `Expired ${date(d.expiryDate)}` : `${d.daysLeft} day${d.daysLeft === 1 ? '' : 's'} left · ${date(d.expiryDate)}`] as [string, string],
    ),
    action: { label: 'Open the document register', url: `${tenantUrl(o.slug)}/m/company-documents` },
  });

// ---------------- EB-3 ----------------

const STAGE_WORDS: Record<string, string> = {
  perm_filed: 'Your PERM labour certification has been filed',
  perm_approved: 'Your PERM labour certification is approved',
  i140_filed: 'Your I-140 petition has been filed',
  i140_approved: 'Your I-140 petition is approved',
  nvc_processing: 'Your case has moved to the National Visa Center',
  ds260_submitted: 'Your DS-260 application has been submitted',
  interview_scheduled: 'Your visa interview has been scheduled',
  visa_approved: 'Your visa has been approved',
  visa_denied: 'A decision has been made on your visa application',
  departed: 'Your departure has been recorded',
};

export const eb3CaseUpdate = (o: {
  company: string;
  candidateName: string;
  caseNo: string;
  stage: string;
  stageDate: string;
  employer: string;
  interviewDate?: string | null;
  consulate?: string | null;
  notes?: string | null;
}): Built =>
  build(`${o.caseNo}: ${STAGE_WORDS[o.stage] ?? 'Your case has been updated'}`, 'EB-3 case update', {
    heading: STAGE_WORDS[o.stage] ?? 'Your case has been updated',
    intro: [
      `Dear ${o.candidateName}, this is an update on your EB-3 case with ${o.employer}, handled by ${o.company}.`,
      ...(o.notes ? [o.notes] : []),
    ],
    rows: [
      ['Case no.', o.caseNo],
      ['Stage', o.stage.replace(/_/g, ' ')],
      ['Recorded on', date(o.stageDate)],
      ...(o.interviewDate ? ([['Interview', date(o.interviewDate)]] as [string, string][]) : []),
      ...(o.consulate ? ([['Consulate', o.consulate]] as [string, string][]) : []),
    ],
    outro: [
      'This message records where your file stands. It is not legal advice, and no fee is ever requested by email — speak to your case officer before paying anything.',
    ],
  });
