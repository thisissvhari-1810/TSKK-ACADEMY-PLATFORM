import Link from 'next/link';
import { ArrowRight, Award, BarChart3, GraduationCap, QrCode, Shield, Users } from 'lucide-react';
import { config } from '@/lib/config';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const features = [
  {
    icon: Users,
    title: 'Student & parent portals',
    body: 'Enrolment, admissions, medical, guardian info, family linking, and self-service dashboards.',
    href: '/dashboard/students',
  },
  {
    icon: QrCode,
    title: 'QR-based attendance',
    body: 'Signed HMAC QR codes for secure check-in, batch mark, holiday & leave workflows, exports.',
    href: '/dashboard/attendance',
  },
  {
    icon: Award,
    title: 'Belt exams & certificates',
    body: 'Schedule exams, grade with rubric, auto-issue verifiable PDF certificates with QR verification.',
    href: '/dashboard/belt-exams',
  },
  {
    icon: GraduationCap,
    title: 'Learning portal',
    body: 'Belt-gated videos, documents, assignments and submissions for structured curriculum.',
    href: '/dashboard/learning',
  },
  {
    icon: BarChart3,
    title: 'Fees & analytics',
    body: 'Razorpay-integrated invoicing, receipts, reminders, revenue, dropout, and belt progression insights.',
    href: '/dashboard/fees',
  },
  {
    icon: Shield,
    title: 'Multi-tenant SaaS',
    body: 'Isolated data per academy, RBAC, audit logs, subscription tiers, and enterprise-grade security.',
    href: '/dashboard',
  },
];

export default function LandingPage() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[80vh] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(185,28,28,0.18),transparent),radial-gradient(50%_50%_at_20%_10%,rgba(245,158,11,0.12),transparent)]"
      />

      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2 font-display text-xl font-bold">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground shadow">
            {config.appShortName.slice(0, 1)}
          </span>
          <span>{config.appShortName}</span>
        </Link>
        <nav className="flex items-center gap-3">
          <Button asChild variant="ghost">
            <Link href="/verify">Verify a certificate</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/register">Get started</Link>
          </Button>
        </nav>
      </header>

      <section className="mx-auto max-w-5xl px-6 pb-24 pt-16 text-center">
        <p className="mb-4 inline-flex items-center rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium uppercase tracking-widest text-primary">
          Multi-tenant academy operating system
        </p>
        <h1 className="text-balance font-display text-4xl font-bold leading-tight sm:text-6xl">
          Run <span className="bg-gradient-to-br from-primary to-secondary bg-clip-text text-transparent">{config.appName}</span> like a modern SaaS.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          Admissions, attendance, fees, belt exams, certificates, events, and analytics — one platform designed
          for Silambam, Karate and multi-sport academies of every size.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Button asChild size="lg">
            <Link href="/login">
              Sign in to your academy <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/register">Create an academy</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="font-display text-2xl font-semibold">Explore the platform</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Click any card to open that section. You&apos;ll be asked to sign in first.
            </p>
          </div>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, body, href }) => (
            <Link
              key={title}
              href={href}
              className="group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-xl"
            >
              <Card className="h-full border-primary/10 bg-card/60 backdrop-blur transition-all group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-lg">
                <CardHeader>
                  <div className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="flex items-center justify-between text-lg">
                    <span>{title}</span>
                    <ArrowRight className="h-4 w-4 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{body}</CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <footer className="border-t border-border/60 py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} {config.appName}. All rights reserved.
      </footer>
    </main>
  );
}
