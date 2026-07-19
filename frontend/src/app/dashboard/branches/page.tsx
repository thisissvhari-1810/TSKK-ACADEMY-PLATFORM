'use client';

import Link from 'next/link';
import { Building2, Pencil, Plus, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SimpleListPage, type Column } from '@/components/data/simple-list';
import { DeleteRowButton } from '@/components/data/delete-row-button';

interface BranchRow {
  id: string;
  name: string;
  code: string;
  city: string;
  state: string;
  isPrimary: boolean;
  isActive: boolean;
  phone: string | null;
  email: string | null;
  _count?: { students: number; batches: number };
}

const columns: Column<BranchRow>[] = [
  {
    key: 'name',
    header: 'Name',
    render: (r) => (
      <Link href={`/dashboard/branches/${r.id}/edit`} className="font-medium hover:text-primary hover:underline">
        {r.name}
      </Link>
    ),
  },
  { key: 'code', header: 'Code', render: (r) => <span className="font-mono text-xs">{r.code}</span> },
  { key: 'loc', header: 'Location', render: (r) => `${r.city}, ${r.state}` },
  {
    key: 'students',
    header: 'Students',
    render: (r) => {
      const count = r._count?.students ?? 0;
      return (
        <Link
          href={`/dashboard/students?branchId=${r.id}`}
          className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2 py-0.5 text-xs font-medium text-foreground/80 hover:border-primary hover:text-primary"
          title={`${count} student${count === 1 ? '' : 's'} enrolled at this branch`}
        >
          <Users className="h-3 w-3" />
          {count}
        </Link>
      );
    },
  },
  {
    key: 'batches',
    header: 'Batches',
    render: (r) => <span className="text-sm">{r._count?.batches ?? 0}</span>,
  },
  { key: 'phone', header: 'Phone', render: (r) => r.phone ?? '—' },
  { key: 'email', header: 'Email', render: (r) => r.email ?? '—' },
  {
    key: 'flags',
    header: '',
    render: (r) => (
      <div className="flex gap-1">
        {r.isPrimary && <Badge variant="info">PRIMARY</Badge>}
        <Badge variant={r.isActive ? 'success' : 'muted'}>{r.isActive ? 'ACTIVE' : 'INACTIVE'}</Badge>
      </div>
    ),
  },
];

export default function BranchesPage() {
  return (
    <SimpleListPage<BranchRow>
      title="Branches"
      description="Physical locations where classes are conducted."
      endpoint="/branches"
      queryKey={['branches']}
      columns={columns}
      emptyIcon={Building2}
      emptyTitle="No branches yet"
      emptyDescription="Add your first branch to start assigning students to it."
      actions={
        <Button asChild>
          <Link href="/dashboard/branches/new">
            <Plus className="h-4 w-4" /> Add branch
          </Link>
        </Button>
      }
      rowActions={(r) => (
        <>
          <Button asChild size="sm" variant="ghost">
            <Link href={`/dashboard/branches/${r.id}/edit`}>
              <Pencil className="h-3.5 w-3.5" />
              <span className="ml-1">Edit</span>
            </Link>
          </Button>
          <DeleteRowButton
            url={`/branches/${r.id}`}
            entity="branch"
            name={`${r.name} (${r.code})`}
            invalidateKeys={[['branches']]}
            iconOnly
            disabled={r.isPrimary}
            disabledReason="Cannot delete the primary branch — promote another branch first"
          />
        </>
      )}
    />
  );
}
