'use client';

import Link from 'next/link';
import { ResourceList } from '@/components/resource';
import { vendorDef } from '@/lib/vendor-def';

export default function VendorsPage() {
  return (
    <div>
      <div className="no-print mb-2 text-right">
        <Link href="/vendors/compliance" className="text-sm text-brand-600 hover:underline">
          Compliance & expiring documents →
        </Link>
      </div>
      <ResourceList def={vendorDef} />
    </div>
  );
}
