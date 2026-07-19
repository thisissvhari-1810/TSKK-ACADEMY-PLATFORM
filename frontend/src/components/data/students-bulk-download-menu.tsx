'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';

import { downloadAuthedFile, extractErrorMessage } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Props {
  filters?: Record<string, string | number | undefined>;
}

export function StudentsBulkDownloadMenu({ filters }: Props) {
  const [busy, setBusy] = useState<'csv' | 'pdf' | null>(null);

  function qs(): string {
    if (!filters) return '';
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
    }
    const s = params.toString();
    return s ? `?${s}` : '';
  }

  async function run(kind: 'csv' | 'pdf') {
    setBusy(kind);
    const today = new Date().toISOString().slice(0, 10);
    try {
      await downloadAuthedFile(`/students/export/${kind}${qs()}`, `students-${today}.${kind}`);
      toast.success(`Students ${kind.toUpperCase()} downloaded`);
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Download failed'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={busy !== null}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          <span className="ml-1">Export all</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Export students (filtered)</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => run('csv')} disabled={busy !== null}>
          <FileSpreadsheet className="h-4 w-4" />
          <span className="ml-2">Spreadsheet</span>
          <span className="ml-auto text-xs text-muted-foreground">.csv</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run('pdf')} disabled={busy !== null}>
          <FileText className="h-4 w-4" />
          <span className="ml-2">Printable report</span>
          <span className="ml-auto text-xs text-muted-foreground">.pdf</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
