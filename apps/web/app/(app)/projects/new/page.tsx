'use client';

import { ResourceForm } from '@/components/resource';
import { projectDef } from '@/lib/project-def';

export default function NewProjectPage() {
  return <ResourceForm def={projectDef} />;
}
