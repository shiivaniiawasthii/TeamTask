# Team Tasks

An Asana / ClickUp-style team task manager built with **Next.js 14 (App Router)**,
**TypeScript**, **Tailwind CSS**, **shadcn/ui** primitives, and **PostgreSQL via
Prisma**. It includes a Kanban board with drag-and-drop, a List view with
filters/sorting, a Dashboard, an embedded **Tldraw** whiteboard per project,
**NextAuth** authentication, and full email integration: notifications via
**Nodemailer** plus an **IMAP** poller that turns email replies into comments
(or new tasks).

---

## Features

- **Auth** — email + password via NextAuth credentials, sessions backed by Prisma.
- **Sidebar** project navigation with quick "new project" dialog.
- **Kanban board** (`@dnd-kit`) — drag tasks across `To Do / In Progress / In Review / Done`.
- **Task detail drawer** — assignee, priority, due date, subtasks (checkable), comments, status.
- **List view** — search, filter by status / priority / assignee, sort by title / priority / due / created.
- **Dashboard** — stat tiles, "my open tasks", projects overview.
- **Whiteboard** — full-screen Tldraw per project, auto-saves snapshot to Postgres.
- **Email**
  - Sends a notification when a task is **assigned**, a **comment** is added, or a **due date** is approaching.
  - Each notification's `Reply-To` is unique to the task (`notifications+task-<id>@yourdomain`).
  - An IMAP worker polls the inbox, parses replies, and either appends a comment to the
    referenced task or — if the address has no task id — creates a new task in a project
    the sender belongs to.
- **Seed script** with sample users, projects, and tasks.

---

## Tech stack

| Concern        | Library                                                |
| -------------- | ------------------------------------------------------ |
| Framework      | Next.js 14 (App Router), TypeScript                    |
| Styling        | Tailwind CSS, shadcn/ui (Radix primitives), lucide-react |
| Database       | PostgreSQL, Prisma                                     |
| Auth           | NextAuth (Credentials), `@auth/prisma-adapter`         |
| Drag & drop    | `@dnd-kit/core` + `@dnd-kit/sortable`                  |
| Whiteboard     | `@tldraw/tldraw`                                       |
| Email outbound | `nodemailer`                                           |
| Email inbound  | `node-imap` + `mailparser`                             |
| Validation     | `zod`                                                  |
| Toasts         | `sonner`                                               |

---

## Quick start

### 1. Prerequisites

- Node.js 18.18+ (20 LTS recommended)
- PostgreSQL 14+
- An SMTP account and a matching IMAP-accessible mailbox (Gmail, FastMail, Mailgun, Postmark, etc.)

### 2. Install

```bash
git clone <your-repo> team-tasks
cd team-tasks
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in the values. Generate a secret:

```bash
openssl rand -base64 32   # paste into NEXTAUTH_SECRET
```

Required keys (see `.env.example` for the full list):

| Variable                 | Notes                                                            |
| ------------------------ | ---------------------------------------------------------------- |
| `DATABASE_URL`           | `postgresql://user:pw@host:5432/team_tasks`                      |
| `NEXTAUTH_URL`           | `http://localhost:3000` in dev                                   |
| `NEXTAUTH_SECRET`        | Random 32-byte base64                                            |
| `SMTP_HOST/PORT/USER/PASS` | Outbound SMTP credentials                                      |
| `EMAIL_FROM`             | e.g. `Team Tasks <notifications@yourdomain.com>`                 |
| `EMAIL_DOMAIN`           | Domain used in unique reply-to (e.g. `yourdomain.com`)           |
| `EMAIL_DOMAIN_LOCAL`     | Local part — full reply-to becomes `<local>+task-<id>@<domain>`  |
| `IMAP_HOST/PORT/USER/PASS` | Inbox the poller reads from. Must accept sub-addressed mail. |
| `IMAP_MAILBOX`           | Defaults to `INBOX`                                              |
| `IMAP_POLL_INTERVAL_MS`  | Defaults to `60000` (1 minute)                                   |
| `DUE_REMINDER_HOURS`     | How far ahead to remind (defaults `24`)                          |

> **Sub-addressing tip.** The IMAP worker matches the `+task-<id>` segment in
> any of `To`, `Cc`, `Delivered-To`, or `Envelope-To`. Most providers (Gmail,
> FastMail, Postmark, ProtonMail w/ short address, Mailgun routes) deliver
> sub-addressed mail to the base inbox. If yours does not, configure a catch-all
> route to forward everything matching `notifications+*@yourdomain` into the
> mailbox the poller reads.

### 4. Database setup

```bash
npx prisma generate
npx prisma db push     # or: npx prisma migrate dev --name init
npm run db:seed
```

Seeded users (all use password `password123`):

- `alice@example.com` (admin)
- `bob@example.com`
- `carol@example.com`

### 5. Run the app

```bash
npm run dev
```

Open <http://localhost:3000> and sign in.

### 6. Run the email workers

In separate terminals (or a process manager like `pm2` / `systemd`):

```bash
# Inbox poller — turns email replies into comments / new tasks
npm run email:poll

# Due-date reminders — run every hour from cron, or manually:
npm run email:cron
```

Alternatively, hit the HTTP endpoint from any external scheduler:

```bash
curl -X POST -H "x-cron-secret: $CRON_SECRET" \
  http://localhost:3000/api/cron/due-reminders
```

---

## How the email-reply flow works

1. When a task is assigned, commented on, or approaching its due date, the app
   sends a notification email via Nodemailer.
2. The `Reply-To` header is set to a per-task address:
   `notifications+task-<taskId>@yourdomain.com`.
3. The IMAP worker (`npm run email:poll`) connects to your mailbox, fetches
   `UNSEEN` messages, and parses them with `mailparser`.
4. For each message:
   - Extract the task id from the recipient address.
   - Resolve the sender to a user (creating one if needed).
   - Verify the sender is a project member.
   - Strip quoted text (`>` lines, `On … wrote:` footers).
   - Append a `Comment` row with `source = "email"`.
   - If the recipient address contains no task id, create a new task in the
     sender's first project with the email subject as the title and the body
     as the description.
5. `messageId` values are recorded in the `ProcessedEmail` table so duplicates
   are ignored if the worker restarts.

---

## Project layout

```
prisma/
  schema.prisma          # User, Project, Task, Subtask, Comment, Whiteboard, …
  seed.ts                # Sample users, projects, tasks
src/
  app/
    (app)/               # Authed app shell (sidebar + topbar)
      dashboard/
      projects/[projectId]/{board,list,whiteboard}/
    api/                 # Route handlers
      auth/[...nextauth]/
      register/
      projects/...
      tasks/[taskId]/{comments,subtasks}/
      subtasks/[subtaskId]/
      cron/due-reminders/
    login/  register/
  components/
    ui/                  # shadcn-style primitives (button, dialog, select, …)
    kanban/              # board, column, task-card
    sidebar.tsx  topbar.tsx  task-detail-drawer.tsx
    list-view.tsx  whiteboard-client.tsx
  lib/                   # prisma client, auth options, helpers
  server/email/          # mailer, notifications, imap-worker, due-cron
```

---

## Common operations

```bash
# Open Prisma Studio
npx prisma studio

# Reset DB (destructive)
npx prisma migrate reset

# Lint
npm run lint

# Build for production
npm run build && npm start
```

---

## Production notes

- **Workers**: run `email:poll` and a periodic `email:cron` (or hit
  `/api/cron/due-reminders`) under a process manager. Each is independent of
  the Next.js server.
- **Secrets**: never check `.env` in. Set `CRON_SECRET` if you expose the cron
  endpoint publicly.
- **Whiteboard**: snapshots are stored as JSON on the `Whiteboard` row. For
  large boards consider splitting persistence (e.g. object storage).
- **Sub-addressing**: confirm your mail provider routes `+task-*` to the
  mailbox the worker reads. Most do; some require an explicit catch-all rule.

---

## License

MIT
