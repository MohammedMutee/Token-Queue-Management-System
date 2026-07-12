import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Create levels
  const level1 = await prisma.level.upsert({
    where: { order: 1 },
    update: {},
    create: { name: "Document Verification", order: 1, queueSortStrategy: "TOKEN_ORDER" },
  });

  const level2 = await prisma.level.upsert({
    where: { order: 2 },
    update: {},
    create: { name: "Final Approval", order: 2, queueSortStrategy: "APPROVAL_TIME" },
  });

  // Create admin user
  const adminPassword = await bcrypt.hash("admin123", 12);
  await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: { username: "admin", password: adminPassword, name: "Administrator", role: "ADMIN" },
  });

  // Create reception user
  const receptionPassword = await bcrypt.hash("reception123", 12);
  await prisma.user.upsert({
    where: { username: "reception" },
    update: {},
    create: { username: "reception", password: receptionPassword, name: "Reception", role: "RECEPTION" },
  });

  // Create cabin operators and cabins for Level 1
  const l1Operators = ["A. Rahman", "Sara Khan", "Omar Ali", "Fatima Noor", "Khalid Hassan",
    "Amina Yusuf", "Tariq Ahmed", "Nadia Malik", "Bilal Shah", "Zara Hussain"];

  for (let i = 0; i < 10; i++) {
    const password = await bcrypt.hash(`cabin${i + 1}`, 12);
    const user = await prisma.user.upsert({
      where: { username: `cabin_l1_${i + 1}` },
      update: {},
      create: {
        username: `cabin_l1_${i + 1}`,
        password,
        name: l1Operators[i],
        role: "CABIN_OPERATOR",
      },
    });

    await prisma.cabin.upsert({
      where: { id: i + 1 },
      update: {},
      create: {
        name: `Cabin ${String(i + 1).padStart(2, "0")}`,
        levelId: level1.id,
        operatorId: user.id,
        isActive: true,
      },
    });
  }

  // Create cabins for Level 2
  const l2Operators = ["Dr. Ahmed", "Dr. Salma", "Dr. Rizwan", "Dr. Hina", "Dr. Faisal",
    "Dr. Ayesha", "Dr. Imran", "Dr. Sana", "Dr. Waqar", "Dr. Mehreen"];

  for (let i = 0; i < 10; i++) {
    const password = await bcrypt.hash(`cabin${i + 11}`, 12);
    const user = await prisma.user.upsert({
      where: { username: `cabin_l2_${i + 1}` },
      update: {},
      create: {
        username: `cabin_l2_${i + 1}`,
        password,
        name: l2Operators[i],
        role: "CABIN_OPERATOR",
      },
    });

    await prisma.cabin.upsert({
      where: { id: i + 11 },
      update: {},
      create: {
        name: `Cabin ${String(i + 1).padStart(2, "0")}`,
        levelId: level2.id,
        operatorId: user.id,
        isActive: true,
      },
    });
  }

  console.log("Seed completed: 2 levels, 20 cabins, 22 users");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
