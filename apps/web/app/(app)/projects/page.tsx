'use client';

import { ResourceList } from '@/components/resource';
import { projectDef } from '@/lib/project-def';

export default function ProjectsPage() {
  return <ResourceList def={projectDef} />;
}
