import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// String literal unions in lieu of enums (SQLite doesn't support enums).
const Role = { ADMIN: "ADMIN", MEMBER: "MEMBER" } as const;
const Priority = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  URGENT: "URGENT",
} as const;
const TaskStatus = {
  TODO: "TODO",
  IN_PROGRESS: "IN_PROGRESS",
  IN_REVIEW: "IN_REVIEW",
  ON_HOLD: "ON_HOLD",
  DONE: "DONE",
} as const;

const day = (offset: number) => new Date(Date.now() + offset * 24 * 60 * 60 * 1000);

async function main() {
  console.log("Seeding database...");

  const passwordHash = await bcrypt.hash("password123", 10);

  const alice = await prisma.user.upsert({
    where: { email: "alice@example.com" },
    update: {},
    create: {
      email: "alice@example.com",
      name: "Alice Johnson",
      role: Role.ADMIN,
      passwordHash,
    },
  });

  const bob = await prisma.user.upsert({
    where: { email: "bob@example.com" },
    update: {},
    create: {
      email: "bob@example.com",
      name: "Bob Martinez",
      role: Role.MEMBER,
      passwordHash,
    },
  });

  const carol = await prisma.user.upsert({
    where: { email: "carol@example.com" },
    update: {},
    create: {
      email: "carol@example.com",
      name: "Carol Singh",
      role: Role.MEMBER,
      passwordHash,
    },
  });

  const projects = [
    {
      key: "WEB",
      name: "Website Redesign",
      description: "Marketing site refresh, Q2 launch.",
      color: "#6366f1",
    },
    {
      key: "MOB",
      name: "Mobile App",
      description: "iOS + Android beta release.",
      color: "#10b981",
    },
    {
      key: "OPS",
      name: "DevOps Migration",
      description: "Move infra from Heroku to AWS.",
      color: "#f59e0b",
    },
  ];

  for (const p of projects) {
    const project = await prisma.project.upsert({
      where: { key: p.key },
      update: {},
      create: p,
    });

    for (const u of [alice, bob, carol]) {
      await prisma.projectMember.upsert({
        where: { projectId_userId: { projectId: project.id, userId: u.id } },
        update: {},
        create: {
          projectId: project.id,
          userId: u.id,
          role: u.id === alice.id ? Role.ADMIN : Role.MEMBER,
        },
      });
    }

    await prisma.whiteboard.upsert({
      where: { projectId: project.id },
      update: {},
      create: { projectId: project.id, snapshot: null },
    });
  }

  const web = await prisma.project.findUniqueOrThrow({ where: { key: "WEB" } });
  const mob = await prisma.project.findUniqueOrThrow({ where: { key: "MOB" } });

  // --- Sprints ---
  const webSprintCurrent = await prisma.sprint.create({
    data: {
      projectId: web.id,
      name: "Sprint 12 — Hero & Pricing",
      goal: "Ship the new homepage hero and revamped pricing section.",
      startDate: day(-5),
      endDate: day(9),
      status: "ACTIVE",
    },
  });
  await prisma.sprint.create({
    data: {
      projectId: web.id,
      name: "Sprint 13 — Launch prep",
      goal: "Final QA, analytics, monitoring, DNS cutover.",
      startDate: day(10),
      endDate: day(24),
      status: "PLANNED",
    },
  });
  const mobSprintCurrent = await prisma.sprint.create({
    data: {
      projectId: mob.id,
      name: "Sprint 4 — Onboarding polish",
      goal: "Finish onboarding flow and push notifications wiring.",
      startDate: day(-3),
      endDate: day(11),
      status: "ACTIVE",
    },
  });

  // --- Milestones ---
  const webMilestoneLaunch = await prisma.milestone.create({
    data: {
      projectId: web.id,
      title: "Public launch",
      description: "Marketing site goes live to all visitors.",
      dueDate: day(28),
      status: "UPCOMING",
    },
  });
  await prisma.milestone.create({
    data: {
      projectId: web.id,
      title: "Internal preview",
      description: "Stakeholder walkthrough on staging.",
      dueDate: day(14),
      status: "UPCOMING",
    },
  });
  const mobMilestoneBeta = await prisma.milestone.create({
    data: {
      projectId: mob.id,
      title: "Closed beta",
      description: "Invite-only beta to 100 users.",
      dueDate: day(21),
      status: "UPCOMING",
    },
  });

  // --- Notes ---
  await prisma.note.create({
    data: {
      projectId: web.id,
      authorId: alice.id,
      title: "Kickoff notes — 2026 site refresh",
      body: "Goals: clearer positioning, pricing transparency, faster mobile.\n\nDecisions:\n- Use Next.js 14 + Tailwind\n- Single CMS (Sanity)\n- Lighthouse target ≥ 95",
    },
  });
  await prisma.note.create({
    data: {
      projectId: web.id,
      authorId: bob.id,
      title: "Design review — hero variants",
      body: "We reviewed 3 hero variants. Going with variant B but tightening copy. Bob to send revised copy by Friday.",
    },
  });
  await prisma.note.create({
    data: {
      projectId: mob.id,
      authorId: alice.id,
      title: "Push notifications — provider decision",
      body: "Choosing FCM for both iOS + Android via APNs bridge. Cost: $0 at our scale. Carol owns implementation.",
    },
  });

  type SeedTask = {
    project: { id: string };
    title: string;
    status: string;
    priority: string;
    assignee: { id: string };
    sub: string[];
    due?: number;
    start?: number;
    end?: number;
    sprintId?: string;
    milestoneId?: string;
  };

  const seedTasks: SeedTask[] = [
    {
      project: web,
      title: "Audit current marketing site",
      status: TaskStatus.DONE,
      priority: Priority.MEDIUM,
      assignee: alice,
      sub: ["Run Lighthouse", "Inventory pages", "Note copy gaps"],
      start: -10,
      end: -5,
    },
    {
      project: web,
      title: "Wireframe new homepage",
      status: TaskStatus.IN_PROGRESS,
      priority: Priority.HIGH,
      assignee: bob,
      sub: ["Hero variants", "Pricing section", "Footer"],
      start: -3,
      end: 5,
      sprintId: webSprintCurrent.id,
    },
    {
      project: web,
      title: "Set up CMS",
      status: TaskStatus.TODO,
      priority: Priority.MEDIUM,
      assignee: carol,
      sub: ["Pick CMS", "Configure roles"],
      sprintId: webSprintCurrent.id,
    },
    {
      project: web,
      title: "Launch checklist",
      status: TaskStatus.IN_REVIEW,
      priority: Priority.URGENT,
      assignee: alice,
      sub: ["DNS", "Analytics", "404 monitoring"],
      due: 3,
      start: 0,
      end: 7,
      milestoneId: webMilestoneLaunch.id,
    },
    {
      project: web,
      title: "Vendor security review (waiting on legal)",
      status: TaskStatus.ON_HOLD,
      priority: Priority.HIGH,
      assignee: alice,
      sub: ["Send DPA", "Wait for sign-off"],
    },
    {
      project: mob,
      title: "Design onboarding flow",
      status: TaskStatus.IN_PROGRESS,
      priority: Priority.HIGH,
      assignee: bob,
      sub: ["Welcome screen", "Permissions"],
      start: -2,
      end: 6,
      sprintId: mobSprintCurrent.id,
    },
    {
      project: mob,
      title: "Implement push notifications",
      status: TaskStatus.TODO,
      priority: Priority.MEDIUM,
      assignee: carol,
      sub: ["FCM setup", "iOS APNs"],
      due: 7,
      sprintId: mobSprintCurrent.id,
      milestoneId: mobMilestoneBeta.id,
    },
    {
      project: mob,
      title: "Beta test plan",
      status: TaskStatus.TODO,
      priority: Priority.LOW,
      assignee: alice,
      sub: [],
      milestoneId: mobMilestoneBeta.id,
    },
    {
      project: mob,
      title: "App store screenshots — blocked on copy",
      status: TaskStatus.ON_HOLD,
      priority: Priority.MEDIUM,
      assignee: bob,
      sub: ["Wait for marketing copy"],
    },
  ];

  let position = 0;
  for (const t of seedTasks) {
    const task = await prisma.task.create({
      data: {
        projectId: t.project.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        position: position++,
        assigneeId: t.assignee.id,
        creatorId: alice.id,
        startDate: typeof t.start === "number" ? day(t.start) : null,
        endDate: typeof t.end === "number" ? day(t.end) : null,
        sprintId: t.sprintId ?? null,
        milestoneId: t.milestoneId ?? null,
        description: `Auto-seeded task: ${t.title}`,
      },
    });

    for (let i = 0; i < t.sub.length; i++) {
      await prisma.subtask.create({
        data: {
          taskId: task.id,
          title: t.sub[i],
          position: i,
          done: t.status === TaskStatus.DONE,
        },
      });
    }

    await prisma.comment.create({
      data: {
        taskId: task.id,
        authorId: alice.id,
        body: "Kicking this one off — let me know if you have questions.",
      },
    });
  }

  console.log("Seed complete. Login with alice@example.com / password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
