'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

import { apiRequest, extractErrorMessage } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FormGrid, FormSection } from '@/components/forms/field';

const schema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  code: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[A-Za-z0-9-_.]+$/, 'Only letters, numbers, dash, underscore, dot'),
  addressLine1: z.string().trim().optional().or(z.literal('')),
  city: z.string().trim().optional().or(z.literal('')),
  state: z.string().trim().optional().or(z.literal('')),
  postalCode: z.string().trim().optional().or(z.literal('')),
  phone: z.string().trim().optional().or(z.literal('')),
  email: z.string().trim().email('Invalid email').optional().or(z.literal('')),
});
type FormValues = z.infer<typeof schema>;

export default function NewBranchPage() {
  const router = useRouter();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { state: 'Tamil Nadu' },
  });
  const errors = form.formState.errors;

  const create = useMutation({
    mutationFn: (v: FormValues) =>
      apiRequest<{ id: string }>({
        method: 'POST',
        url: '/branches',
        data: {
          name: v.name,
          code: v.code,
          addressLine1: v.addressLine1 || undefined,
          city: v.city || undefined,
          state: v.state || undefined,
          postalCode: v.postalCode || undefined,
          phone: v.phone || undefined,
          email: v.email || undefined,
        },
      }),
    onSuccess: () => {
      toast.success('Branch created');
      router.push('/dashboard/branches');
    },
    onError: (err) => toast.error(extractErrorMessage(err, 'Could not create branch')),
  });

  return (
    <form className="space-y-6" onSubmit={form.handleSubmit((v) => create.mutate(v))}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button asChild size="sm" variant="ghost" className="mb-2 -ml-2 h-7">
            <Link href="/dashboard/branches">
              <ArrowLeft className="h-4 w-4" /> Branches
            </Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Add a branch</h1>
        </div>
        <Button type="submit" loading={create.isPending}>
          Save
        </Button>
      </div>

      <FormSection title="Branch details" description="Only the name and code are required. Everything else is optional.">
        <FormGrid>
          <Field label="Name" required error={errors.name?.message}>
            <Input {...form.register('name')} placeholder="e.g. Medavakkam Branch" />
          </Field>
          <Field label="Code" required error={errors.code?.message}>
            <Input {...form.register('code')} placeholder="e.g. MEDAVAKKAM" />
          </Field>
          <Field label="Address (optional)" error={errors.addressLine1?.message} className="sm:col-span-2">
            <Input {...form.register('addressLine1')} placeholder="Street / area" />
          </Field>
          <Field label="City (optional)" error={errors.city?.message}>
            <Input {...form.register('city')} placeholder="e.g. Chennai" />
          </Field>
          <Field label="State (optional)" error={errors.state?.message}>
            <Input {...form.register('state')} />
          </Field>
          <Field label="Postal code (optional)">
            <Input {...form.register('postalCode')} placeholder="e.g. 600100" />
          </Field>
          <Field label="Phone (optional)">
            <Input {...form.register('phone')} placeholder="+91 98xxxxxxxx" />
          </Field>
          <Field label="Email (optional)" error={errors.email?.message} className="sm:col-span-2">
            <Input type="email" {...form.register('email')} placeholder="branch@academy.in" />
          </Field>
        </FormGrid>
      </FormSection>
    </form>
  );
}
