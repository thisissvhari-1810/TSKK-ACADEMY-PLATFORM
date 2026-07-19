'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Download, FileJson, FileText, Loader2 } from 'lucide-react';

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
  studentId: string;
  studentCode?: string;
  studentName?: string;
  size?: 'sm' | 'default' | 'icon';
  variant?: 'default' | 'outline' | 'ghost';
  align?: 'start' | 'end';
  iconOnly?: boolean;
  label?: string;
}

export function StudentDownloadMenu({
  studentId,
  studentCode,
  studentName,
  size = 'sm',
  variant = 'outline',
  align = 'end',
  iconOnly = false,
  label = 'Download',
}: Props) {
  const [busy, setBusy] = useState<'pdf' | 'json' | null>(null);

  const baseName = [studentCode, studentName?.replace(/\s+/g, '_')].filter(Boolean).join('_') || 'student';

  async function run(kind: 'pdf' | 'json') {
    setBusy(kind);
    const suffix = kind === 'pdf' ? 'pdf' : 'json';
    try {
      await downloadAuthedFile(`/students/${studentId}/export.${suffix}`, `${baseName}.${suffix}`);
      toast.success(kind === 'pdf' ? 'Profile PDF downloaded' : 'Full data (JSON) downloaded');
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Download failed'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
        <Button
          size={iconOnly ? 'icon' : size}
          variant={variant}
          disabled={busy !== null}
          aria-label="Download student data"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {!iconOnly && <span className="ml-1">{label}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-56">
        <DropdownMenuLabel>Download student data</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            run('pdf');
          }}
          disabled={busy !== null}
        >
          <FileText className="h-4 w-4" />
          <span className="ml-2">Profile PDF</span>
          <span className="ml-auto text-xs text-muted-foreground">.pdf</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            run('json');
          }}
          disabled={busy !== null}
        >
          <FileJson className="h-4 w-4" />
          <span className="ml-2">Full data bundle</span>
          <span className="ml-auto text-xs text-muted-foreground">.json</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
