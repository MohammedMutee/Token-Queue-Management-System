import { prisma } from "./db";

export async function getOrCreateTodaySession() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let session = await prisma.session.findUnique({ where: { date: today } });
  if (!session) {
    session = await prisma.session.create({
      data: { date: today, lastTokenNo: 0, isActive: true },
    });
  }
  return session;
}
