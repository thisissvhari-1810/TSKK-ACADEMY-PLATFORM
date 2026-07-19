'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { apiRequest, extractErrorMessage } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Variant = 'ghost' | 'destructive' | 'outline';
type Size = 'sm' | 'default' | 'lg' | 'icon';

interface Props {
  /** Full URL path to DELETE (e.g. `/students/abc`). */
  url: string;
  /** Human label for the entity, used in prompts (e.g. "student", "batch"). */
  entity: string;
  /** Display name of the specific record, shown in the dialog. */
  name?: string;
  /** Query keys to invalidate after a successful delete. */
  invalidateKeys?: unknown[][];
  /** Called after a successful delete (e.g. router.push). */
  onDeleted?: () => void;
  /** Label shown on the trigger button. Defaults to "Delete". Ignored when `iconOnly`. */
  label?: string;
  /** Render only a trash icon (compact list rows). */
  iconOnly?: boolean;
  variant?: Variant;
  size?: Size;
  /** Optional confirm-by-typing (usually the record's code/name). If set, the confirm button
   *  is disabled until the user types this exact string. */
  confirmMatch?: string;
  disabled?: boolean;
  disabledReason?: string;
}

export function DeleteRowButton({
  url,
  entity,
  name,
  invalidateKeys,
  onDeleted,
  label = 'Delete',
  iconOnly = false,
  variant = 'ghost',
  size = 'sm',
  confirmMatch,
  disabled = false,
  disabledReason,
}: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');

  const mutation = useMutation({
    mutationFn: () => apiRequest({ method: 'DELETE', url }),
    onSuccess: async () => {
      toast.success(`${capitalize(entity)} deleted`);
      if (invalidateKeys?.length) {
        await Promise.all(invalidateKeys.map((k) => qc.invalidateQueries({ queryKey: k })));
      } else {
        await qc.invalidateQueries();
      }
      setOpen(false);
      setTyped('');
      onDeleted?.();
    },
    onError: (err) => toast.error(extractErrorMessage(err, `Could not delete ${entity}`)),
  });

  const matchOk = !confirmMatch || typed.trim() === confirmMatch;

  return (
    <>
      <Button
        type="button"
        variant={iconOnly ? 'ghost' : variant}
        size={iconOnly ? 'icon' : size}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!disabled) setOpen(true);
        }}
        disabled={disabled}
        title={disabled ? disabledReason ?? `Delete ${entity}` : `Delete ${entity}`}
        className={
          iconOnly
            ? 'h-8 w-8 text-muted-foreground hover:text-destructive'
            : variant === 'ghost'
              ? 'text-destructive hover:bg-destructive/10 hover:text-destructive'
              : undefined
        }
      >
        <Trash2 className="h-4 w-4" />
        {!iconOnly && <span className="ml-1">{label}</span>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {entity}?</DialogTitle>
            <DialogDescription>
              {name ? (
                <>
                  You are about to delete <span className="font-medium text-foreground">{name}</span>. This
                  action cannot be undone from the UI.
                </>
              ) : (
                <>This will remove the {entity}. This action cannot be undone from the UI.</>
              )}
            </DialogDescription>
          </DialogHeader>

          {confirmMatch && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Type <span className="font-mono text-foreground">{confirmMatch}</span> to confirm:
              </p>
              <input
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder={confirmMatch}
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !matchOk}
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Deleting…
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" /> Delete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
