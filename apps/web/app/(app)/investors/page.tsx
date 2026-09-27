'use client';

import Link from 'next/link';
import { ResourceList } from '@/components/resource';
import { RESOURCES } from '@/lib/resources';

export default function InvestorsPage() {
  return (
    <div>
      <div className="no-print mb-2 flex flex-wrap justify-end gap-4 text-sm">
        <Link href="/m/investor-agreements" className="text-brand-600 hover:underline">
          Agreements →
        </Link>
        <Link href="/m/investor-transactions" className="text-brand-600 hover:underline">
          Money in & out →
        </Link>
        <Link href="/investors/entitlements" className="text-brand-600 hover:underline">
          Profit sharing by project →
        </Link>
      </div>
      <ResourceList def={RESOURCES.investors} />
    </div>
  );
}
