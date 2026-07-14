# Tamilar Silamba Kalai Koodam (TSKK) — Academy Management System

A production-grade, multi-tenant SaaS platform for managing traditional and modern martial-arts academies. Built first for **Tamilar Silamba Kalai Koodam** and architected to scale to Karate, Taekwondo, Kalari, Boxing, MMA, Yoga, Dance and Music academies from the same codebase.

---

## Highlights

- **Multi-tenant** by design — every row is scoped to an `academy_id`, enforced at the ORM layer and by a request-scoped tenant guard.
- **Role-based access control** — Super Admin, Academy Admin, Instructor, Receptionist, Accountant, Parent, Student.
- **QR-based attendance** — every student has a signed QR code, scanners verify HMAC before writing attendance.
- **Payments** — Razorpay (UPI / Cards / Net Banking) with automatic PDF receipts and reconciliation.
- **Certificates & belt exams** — signed PDFs with QR-verifiable public URLs.
- **Notifications** — Email (SMTP), SMS, WhatsApp (Meta Cloud API), Web Push.
- **Learning portal** — videos, PDFs, assignments, practice schedules.
- **Reports** — attendance, revenue, dropout, belt progression, instructor performance.
- **DevOps-ready** — Docker, Docker Compose, Nginx reverse proxy, Jenkins CI/CD, PostgreSQL, MinIO, Redis.

---

## Technology

| Layer | Stack |
|-------|-------|
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, shadcn/ui, React Hook Form, Zod, TanStack Query, Zustand |
| Backend | NestJS 10, TypeScript, Prisma ORM, PostgreSQL, Redis (queues + cache), JWT + refresh tokens, Passport |
| Storage | MinIO (S3-compatible) for photos, certificates, videos, documents |
| Payments | Razorpay Orders API + Webhooks |
| Notifications | Nodemailer, Twilio (SMS), Meta WhatsApp Cloud API, Web Push |
| PDF | Puppeteer (server-rendered HTML → PDF) |
| DevOps | Docker, Docker Compose, Nginx, Jenkins, GitHub-flow branching |

---

## Repository layout

```
TSKK-ACADEMY-PLATFORM/
├── backend/                  # NestJS API
│   ├── prisma/               # Schema, migrations, seed
│   └── src/
│       ├── common/           # Guards, filters, interceptors, decorators, utils
│       ├── config/           # Env-typed configuration
│       ├── database/         # PrismaService
│       └── modules/          # Auth, students, attendance, fees, ...
├── frontend/                 # Next.js 15 web app
│   └── src/
│       ├── app/              # App-router pages
│       ├── components/
│       ├── lib/
│       └── stores/
├── docker/                   # Dockerfiles + local dev config
├── nginx/                    # Production reverse-proxy config
├── jenkins/                  # Jenkinsfile + build scripts
├── scripts/                  # Backup, restore, dev bootstrap
├── docs/                     # Architecture, API, deployment
├── docker-compose.yml        # Local development stack
├── docker-compose.prod.yml   # Production stack
└── .env.example
```

---

## Local development

### Prerequisites

- Node.js 20 LTS
- pnpm 9+ (or npm 10)
- Docker Desktop
- Git

### Bootstrap

```bash
git clone <repo> tskk
cd tskk
cp .env.example .env
docker compose up -d postgres redis minio mailhog
cd backend  && pnpm install && pnpm prisma migrate deploy && pnpm prisma db seed && pnpm start:dev
cd frontend && pnpm install && pnpm dev
```

- API:      http://localhost:4000/api/v1
- Swagger:  http://localhost:4000/docs
- Web:      http://localhost:3000
- MinIO:    http://localhost:9001  (login: `minioadmin` / `minioadmin`)
- Mailhog:  http://localhost:8025

### Seeded credentials

| Role | Email | Password |
|------|-------|----------|
| Super Admin | `superadmin@tskk.in` | `ChangeMe#2026` |
| Academy Admin | `admin@tskk.in`      | `ChangeMe#2026` |
| Instructor    | `instructor@tskk.in` | `ChangeMe#2026` |
| Receptionist  | `reception@tskk.in`  | `ChangeMe#2026` |
| Accountant    | `accounts@tskk.in`   | `ChangeMe#2026` |
| Parent        | `parent@tskk.in`     | `ChangeMe#2026` |
| Student       | `student@tskk.in`    | `ChangeMe#2026` |

**Change all default passwords before deploying to production.**

---

## Production deployment

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Short version:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

Nginx terminates TLS and proxies `/api` → backend, `/` → frontend. Jenkins pipeline in `jenkins/Jenkinsfile` handles build → test → image → deploy.

---

## Security

- Argon2id password hashing
- JWT access tokens (short-lived) + rotating refresh tokens stored hashed
- Helmet, CORS allow-list, rate limiting via `@nestjs/throttler`
- Zod input validation on every endpoint
- Prisma parametrised queries — no raw string concatenation
- Every mutating request is written to `audit_logs`
- Cross-tenant access is impossible: the `TenantGuard` rejects any request whose JWT `academyId` does not match the resource being touched

Report vulnerabilities to `security@tskk.in`.

---

## License

Proprietary — © Tamilar Silamba Kalai Koodam. All rights reserved.
