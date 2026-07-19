'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

import { apiRequest, extractErrorMessage } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FormGrid, FormSection } from '@/components/forms/field';
import { Skeleton } from '@/components/ui/skeleton';

const schema = z.object({
  name: z.string().trim().min(2),
  code: z.string().trim().min(1),
  addressLine1: z.string().trim().optional().or(z.literal('')),
  city: z.string().trim().optional().or(z.literal('')),
  state: z.string().trim().optional().or(z.literal('')),
  postalCode: z.string().trim().optional().or(z.literal('')),
  phone: z.string().trim().optional().or(z.literal('')),
  email: z.string().trim().email('Invalid email').optional().or(z.literal('')),
  isActive: z.boolean().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function EditBranchPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const branch = useQuery({
    queryKey: ['branch', id],
    queryFn: () => apiRequest<Record<string, unknown>>({ method: 'GET', url: `/branches/${id}` }),
  });

  const form = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (branch.data) form.reset(branch.data as unknown as FormValues);
  }, [branch.data, form]);

  const save = useMutation({
    mutationFn: (v: FormValues) =>
      apiRequest({
        method: 'PATCH',
        url: `/branches/${id}`,
        data: Object.fromEntries(Object.entries(v).map(([k, val]) => [k, val === '' ? undefined : val])),
      }),
    onSuccess: () => {
      toast.success('Branch updated');
      qc.invalidateQueries({ queryKey: ['branch', id] });
      router.push('/dashboard/branches');
    },
    onError: (err) => toast.error(extractErrorMessage(err, 'Could not update branch')),
  });

  if (branch.isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <form className="space-y-6" onSubmit={form.handleSubmit((v) => save.mutate(v))}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button asChild size="sm" variant="ghost" className="mb-2 -ml-2 h-7">
            <Link href="/dashboard/branches">
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Edit branch</h1>
        </div>
        <Button type="submit" loading={save.isPending}>Save changes</Button>
      </div>

      <FormSection title="Branch details">
        <FormGrid>
          <Field label="Name" required error={form.formState.errors.name?.message}>
            <Input {...form.register('name')} />
          </Field>
          <Field label="Code" required error={form.formState.errors.code?.message}>
            <Input {...form.register('code')} />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Input {...form.register('addressLine1')} />
          </Field>
          <Field label="City"><Input {...form.register('city')} /></Field>
          <Field label="State"><Input {...form.register('state')} /></Field>
          <Field label="Postal code"><Input {...form.register('postalCode')} /></Field>
          <Field label="Phone"><Input {...form.register('phone')} /></Field>
          <Field label="Email" error={form.formState.errors.email?.message} className="sm:col-span-2">
            <Input type="email" {...form.register('email')} />
          </Field>
          <Field label="Status" className="sm:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                checked={form.watch('isActive') !== false}
                onChange={(e) => form.setValue('isActive', e.target.checked, { shouldDirty: true })}
              />
              <span>Active (uncheck to disable this branch)</span>
            </label>
          </Field>
        </FormGrid>
      </FormSection>
    </form>
  );
}
