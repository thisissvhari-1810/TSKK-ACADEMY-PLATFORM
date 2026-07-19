/**
 * One-shot cleanup script:
 *   1. Free the studentCode slot of every soft-deleted student
 *      (append "-DEL-<timestamp>" so their number can be reused).
 *   2. Renumber every ACTIVE student in creation order so the codes are
 *      contiguous and start from 1 (per academy), matching what the user
 *      sees in the UI when there are, effectively, "no students".
 *   3. Regenerate the QR payload/signature for each renumbered active
 *      student so QR scans continue to resolve correctly.
 *
 * Run once: `npx tsx backend/scripts/renumber-student-codes.ts`
 * The script is idempotent — codes that are already the expected value
 * are left untouched (and their QRs aren't regenerated).
 */
import 'dotenv/config';

import { PrismaClient } from '@prisma/client';
import { buildStudentQrPayload } from '../src/common/utils/qr.util';

async function main() {
  const prisma = new PrismaClient();
  const secret = process.env.QR_HMAC_SECRET;
  if (!secret) throw new Error('QR_HMAC_SECRET missing from environment');

  const academies = await prisma.academy.findMany({ select: { id: true, name: true } });
  let freed = 0;
  let renumbered = 0;

  for (const academy of academies) {
    const settings = await prisma.academySetting.findUnique({ where: { academyId: academy.id } });
    const prefix = settings?.studentCodePrefix ?? 'STU';

    // 1) Free soft-deleted rows still holding a "clean" code.
    const softDeleted = await prisma.student.findMany({
      where: {
        academyId: academy.id,
        deletedAt: { not: null },
        NOT: { studentCode: { contains: '-DEL-' } },
      },
      select: { id: true, studentCode: true },
    });
    for (const s of softDeleted) {
      const stamp = Date.now();
      await prisma.student.update({
        where: { id: s.id },
        data: { studentCode: `${s.studentCode}-DEL-${stamp}-${s.id.slice(-6)}` },
      });
      freed++;
    }

    // 2) Renumber active students in creation order → PREFIX-0001, PREFIX-0002, …
    const active = await prisma.student.findMany({
      where: { academyId: academy.id, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, studentCode: true },
    });

    // Two-phase rename to sidestep the (academyId, studentCode) unique index:
    // first move everyone to a temporary code, then to the final target.
    for (let i = 0; i < active.length; i++) {
      const tempCode = `__TMP__-${academy.id}-${i}`;
      await prisma.student.update({
        where: { id: active[i].id },
        data: { studentCode: tempCode },
      });
    }
    for (let i = 0; i < active.length; i++) {
      const targetCode = `${prefix}-${String(i + 1).padStart(4, '0')}`;
      if (active[i].studentCode === targetCode) continue;
      const { payload, signature } = buildStudentQrPayload({
        secret,
        academyId: academy.id,
        studentCode: targetCode,
      });
      await prisma.student.update({
        where: { id: active[i].id },
        data: { studentCode: targetCode, qrCode: payload, qrSignature: signature },
      });
      renumbered++;
    }

    console.log(
      `[${academy.name}] freed ${softDeleted.length} slot(s), renumbered ${active.length} active student(s).`,
    );
  }

  console.log(`Done. Freed ${freed} soft-deleted slot(s), renumbered ${renumbered} active student(s).`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
