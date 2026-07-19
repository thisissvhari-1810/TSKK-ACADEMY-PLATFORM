'use client';

import { useQuery } from '@tanstack/react-query';
import { Building2, Loader2 } from 'lucide-react';

import { apiListRequest } from '@/lib/api-client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

function displayLabel(b: { code: string; name: string }): string {
  return (b.code || b.name || '').toUpperCase();
}

export interface BranchOption {
  id: string;
  code: string;
  name: string;
  city?: string | null;
  isActive?: boolean;
  isPrimary?: boolean;
}

interface Props {
  value?: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  allowClear?: boolean;
  disabled?: boolean;
}

const NONE_VALUE = '__none__';

export function BranchSelect({
  value,
  onChange,
  placeholder = 'Select a branch…',
  allowClear = true,
  disabled = false,
}: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['branches', 'select', 'active'],
    queryFn: () =>
      apiListRequest<BranchOption>({
        method: 'GET',
        url: '/branches',
        params: { isActive: true, pageSize: 100 },
      }),
    staleTime: 60_000,
  });

  const branches = data?.items ?? [];

  return (
    <Select
      value={value ?? NONE_VALUE}
      onValueChange={(v) => onChange(v === NONE_VALUE ? null : v)}
      disabled={disabled || isLoading}
    >
      <SelectTrigger>
        {isLoading ? (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading branches…
          </span>
        ) : (
          <SelectValue placeholder={placeholder} />
        )}
      </SelectTrigger>
      <SelectContent>
        {allowClear && (
          <SelectItem value={NONE_VALUE}>
            <span className="text-muted-foreground">— No branch —</span>
          </SelectItem>
        )}
        {isError && (
          <SelectItem value="__err__" disabled>
            Failed to load branches
          </SelectItem>
        )}
        {branches.length === 0 && !isLoading && !isError && (
          <SelectItem value="__empty__" disabled>
            No branches configured yet
          </SelectItem>
        )}
        {branches.map((b) => (
          <SelectItem key={b.id} value={b.id}>
            <span className="flex items-center gap-2 font-medium tracking-wide">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{displayLabel(b)}</span>
              {b.isPrimary && <span className="ml-1 text-xs font-normal text-primary">(PRIMARY)</span>}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
