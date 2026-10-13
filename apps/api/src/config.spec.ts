import { parseOrigins } from './config';

const allowed = (origins: (string | RegExp)[], origin: string) =>
  origins.some((o) => (typeof o === 'string' ? o === origin : o.test(origin)));

describe('parseOrigins', () => {
  const origins = parseOrigins('https://erp.example.com, https://*.erp.example.com/');

  it('keeps exact origins as strings', () => {
    expect(origins[0]).toBe('https://erp.example.com');
    expect(allowed(origins, 'https://erp.example.com')).toBe(true);
  });

  it('lets one wildcard label match a company subdomain', () => {
    expect(allowed(origins, 'https://acme.erp.example.com')).toBe(true);
    expect(allowed(origins, 'https://acme-2.erp.example.com')).toBe(true);
  });

  it('rejects look-alikes', () => {
    expect(allowed(origins, 'https://a.b.erp.example.com')).toBe(false);
    expect(allowed(origins, 'https://acme.erp.example.com.evil.com')).toBe(false);
    expect(allowed(origins, 'https://acmeerp.example.com')).toBe(false);
    expect(allowed(origins, 'http://acme.erp.example.com')).toBe(false);
    expect(allowed(origins, 'https://evil.com')).toBe(false);
  });
});
