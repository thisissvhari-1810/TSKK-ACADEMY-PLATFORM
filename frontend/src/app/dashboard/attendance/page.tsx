'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  CalendarDays,
  CheckCheck,
  CheckCircle2,
  ClipboardList,
  History,
  LayoutList,
  QrCode,
  Save,
  Users,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { apiRequest, extractErrorMessage } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Field, FormGrid } from '@/components/forms/field';
import { BranchSelect } from '@/components/forms/branch-select';
import { EmptyState } from '@/components/data/empty-state';

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

interface RosterEntry {
  studentId: string;
  studentCode: string;
  studentName: string;
  currentBelt: string;
  status: AttendanceStatus | null;
  attendanceId: string | null;
}

interface RosterResponse {
  branch: { id: string; code: string; name: string };
  date: string;
  entries: RosterEntry[];
  stats: Record<string, number>;
}

const STATUS_BADGE: Record<AttendanceStatus, 'success' | 'destructive' | 'warning' | 'info'> = {
  PRESENT: 'success',
  ABSENT: 'destructive',
  LATE: 'warning',
  EXCUSED: 'info',
};

export default function AttendancePage() {
  const [branchId, setBranchId] = useState<string | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selections, setSelections] = useState<Record<string, AttendanceStatus>>({});
  const qc = useQueryClient();

  const roster = useQuery<RosterResponse>({
    queryKey: ['branch-roster', branchId, date],
    queryFn: () =>
      apiRequest<RosterResponse>({
        method: 'GET',
        url: `/attendance/branches/${branchId}/roster`,
        params: { date },
      }),
    enabled: Boolean(branchId && date),
  });

  // Seed local selections from the fetched roster. Rows with no existing
  // attendance default to PRESENT so a busy front-desk can just save.
  useEffect(() => {
    if (!roster.data) return;
    const seed: Record<string, AttendanceStatus> = {};
    for (const e of roster.data.entries) {
      seed[e.studentId] = (e.status as AttendanceStatus) ?? 'PRESENT';
    }
    setSelections(seed);
  }, [roster.data]);

  const save = useMutation({
    mutationFn: () => {
      if (!branchId) throw new Error('Pick a branch first');
      const entries = Object.entries(selections).map(([studentId, status]) => ({
        studentId,
        status,
      }));
      if (entries.length === 0) throw new Error('No students to save');
      return apiRequest({
        method: 'POST',
        url: '/attendance/branch-bulk',
        data: {
          branchId,
          date: new Date(`${date}T00:00:00.000Z`).toISOString(),
          entries,
        },
      });
    },
    onSuccess: (res: unknown) => {
      const { created = 0, updated = 0 } =
        (res as { created?: number; updated?: number } | undefined) ?? {};
      toast.success(
        created + updated === 0
          ? 'Attendance saved'
          : `Saved · ${created} new, ${updated} updated`,
      );
      roster.refetch();
      qc.invalidateQueries({ queryKey: ['attendance'] });
    },
    onError: (err) => toast.error(extractErrorMessage(err, 'Failed to save attendance')),
  });

  const setAll = (status: AttendanceStatus) => {
    if (!roster.data) return;
    const next: Record<string, AttendanceStatus> = {};
    for (const e of roster.data.entries) next[e.studentId] = status;
    setSelections(next);
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
    for (const s of Object.values(selections)) c[s] = (c[s] ?? 0) + 1;
    return c;
  }, [selections]);

  const entries = roster.data?.entries ?? [];
  const total = entries.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Attendance</h1>
          <p className="text-sm text-muted-foreground">
            Pick a branch, then tick each student present or absent for the day.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/attendance/records">
              <History className="h-4 w-4" /> Records
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/attendance/holidays">
              <CalendarDays className="h-4 w-4" /> Holidays
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/attendance/batch">
              <LayoutList className="h-4 w-4" /> Batch report
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/attendance/new">
              <ClipboardList className="h-4 w-4" /> Individual
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/attendance/scan">
              <QrCode className="h-4 w-4" /> Scan QR
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <FormGrid>
            <Field label="Branch" required>
              <BranchSelect
                value={branchId}
                onChange={setBranchId}
                allowClear={false}
                placeholder="Select a branch…"
              />
            </Field>
            <Field label="Date" required>
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </Field>
          </FormGrid>
        </CardContent>
      </Card>

      {!branchId ? (
        <Card>
          <EmptyState
            icon={Building2}
            title="Choose a branch to begin"
            description="Once you select a branch, every active student in it will appear here so you can mark them present or absent."
          />
        </Card>
      ) : roster.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title="No active students at this branch"
            description="Add students to this branch first, then come back to record attendance."
          />
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                {roster.data?.branch.code?.toUpperCase()}
                <Badge variant="outline" className="text-xs font-normal">
                  {total} student{total === 1 ? '' : 's'}
                </Badge>
              </CardTitle>
              <div className="flex flex-wrap gap-1.5 text-xs">
                <Badge variant="success">Present: {counts.PRESENT ?? 0}</Badge>
                <Badge variant="destructive">Absent: {counts.ABSENT ?? 0}</Badge>
                {(counts.LATE ?? 0) > 0 && <Badge variant="warning">Late: {counts.LATE}</Badge>}
                {(counts.EXCUSED ?? 0) > 0 && <Badge variant="info">Excused: {counts.EXCUSED}</Badge>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setAll('PRESENT')}>
                <CheckCheck className="h-4 w-4" /> All present
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAll('ABSENT')}>
                <XCircle className="h-4 w-4" /> All absent
              </Button>
              <Button
                size="sm"
                loading={save.isPending}
                disabled={total === 0}
                onClick={() => save.mutate()}
              >
                <Save className="h-4 w-4" /> Save attendance
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {entries.map((e) => {
                const current = selections[e.studentId] ?? 'PRESENT';
                const present = current === 'PRESENT';
                return (
                  <li
                    key={e.studentId}
                    className={
                      'flex flex-wrap items-center justify-between gap-3 p-3 transition-colors ' +
                      (present ? 'bg-emerald-50/60 dark:bg-emerald-950/10' : '')
                    }
                  >
                    <label
                      className="flex flex-1 cursor-pointer items-center gap-3"
                      htmlFor={`present-${e.studentId}`}
                    >
                      <input
                        id={`present-${e.studentId}`}
                        type="checkbox"
                        className="h-5 w-5 cursor-pointer accent-emerald-600"
                        checked={present}
                        onChange={(ev) =>
                          setSelections((prev) => ({
                            ...prev,
                            [e.studentId]: ev.target.checked ? 'PRESENT' : 'ABSENT',
                          }))
                        }
                      />
                      <div>
                        <p className="font-medium leading-tight">{e.studentName}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {e.studentCode} · {e.currentBelt}
                        </p>
                      </div>
                    </label>
                    <div className="flex items-center gap-1">
                      <StatusButton
                        active={current === 'PRESENT'}
                        variant="present"
                        onClick={() =>
                          setSelections((prev) => ({ ...prev, [e.studentId]: 'PRESENT' }))
                        }
                      >
                        <CheckCircle2 className="h-4 w-4" /> Present
                      </StatusButton>
                      <StatusButton
                        active={current === 'ABSENT'}
                        variant="absent"
                        onClick={() =>
                          setSelections((prev) => ({ ...prev, [e.studentId]: 'ABSENT' }))
                        }
                      >
                        <XCircle className="h-4 w-4" /> Absent
                      </StatusButton>
                      <select
                        value={current}
                        onChange={(ev) =>
                          setSelections((prev) => ({
                            ...prev,
                            [e.studentId]: ev.target.value as AttendanceStatus,
                          }))
                        }
                        className="ml-1 h-8 rounded-md border border-input bg-background px-2 text-xs"
                        aria-label="Detailed status"
                        title="Detailed status"
                      >
                        <option value="PRESENT">Present</option>
                        <option value="ABSENT">Absent</option>
                        <option value="LATE">Late</option>
                        <option value="EXCUSED">Excused</option>
                      </select>
                      {e.status && e.status !== current && (
                        <Badge variant={STATUS_BADGE[e.status]} className="ml-1 text-[10px]">
                          was {e.status}
                        </Badge>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface StatusButtonProps {
  active: boolean;
  variant: 'present' | 'absent';
  onClick: () => void;
  children: React.ReactNode;
}

function StatusButton({ active, variant, onClick, children }: StatusButtonProps) {
  const base =
    'inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors';
  const presentActive = 'border-emerald-600 bg-emerald-600 text-white shadow-sm';
  const absentActive = 'border-red-600 bg-red-600 text-white shadow-sm';
  const idle =
    'border-input bg-background text-muted-foreground hover:border-foreground hover:text-foreground';
  const cls = active ? (variant === 'present' ? presentActive : absentActive) : idle;
  return (
    <button type="button" onClick={onClick} className={base + ' ' + cls}>
      {children}
    </button>
  );
}
