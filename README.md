<<<<<<< HEAD
# Oryx Design — Job Tracker

Scaffold design job management system. Runs entirely locally — no cloud services,
no Docker, no database server.

## Quick start

```bash
npm install
npm run dev
# → http://localhost:3000
```

On first start, `lib/db.ts` automatically creates the SQLite database at
`prisma/oryx.db` and runs the schema migration. No manual steps needed.

## Database

### Seed sample data
```bash
npm run db:seed     # adds 6 sample Bristol scaffold jobs
```

### Reset and re-seed
```bash
npm run db:reset    # deletes oryx.db and re-seeds
```

### Check database health
```bash
npm run db:check    # CLI check — prints job count and DB path
```

### Health check page
Visit http://localhost:3000/health for a live dashboard showing:
- Database connection status
- Read/write test results
- Sequence generator status
- Job count

## Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Framework | Next.js 16 (App Router)             |
| Language  | TypeScript                          |
| Database  | SQLite via **better-sqlite3**       |
| Styling   | Tailwind CSS                        |
| UI        | Radix UI primitives                 |

> **Why not Prisma?** Prisma requires downloading native binary engines from
> `binaries.prisma.sh`. This host is blocked in many CI, Docker, and managed
> environments. `better-sqlite3` compiles from source using the system Node
> headers and has zero runtime download requirements.

## Drawing numbers

Auto-assigned on job creation:

```
YY/ORYX/MM/NNN    →    26/ORYX/06/001
```

The sequence resets each calendar month. Atomic SQLite transaction prevents
duplicates under concurrent load.

## API

| Method | Path                | Description              |
|--------|---------------------|--------------------------|
| GET    | /api/jobs           | List/search/filter jobs  |
| POST   | /api/jobs           | Create a job             |
| GET    | /api/jobs/:id       | Get a single job         |
| PATCH  | /api/jobs/:id       | Update a job             |
| DELETE | /api/jobs/:id       | Delete a job             |
| GET    | /api/stats          | Dashboard statistics     |
| GET    | /api/health         | System health check      |

### GET /api/jobs query params

| Param         | Default    | Notes                                      |
|---------------|------------|--------------------------------------------|
| page          | 1          |                                            |
| limit         | 25         | Max 100                                    |
| search        | ""         | Searches drawing no, address, client, etc  |
| status        | ""         | Filter by job status                       |
| invoiceStatus | ""         | Filter by invoice status                   |
| sortBy        | createdAt  | createdAt, drawingNumber, clientCompany… |
| sortDir       | desc       | asc or desc                                |
| export        | false      | true = all matching rows, no pagination    |
=======
# ORYX-SOFTWARE
Internal Software for ORYX
>>>>>>> 9b8889719484343289b69be950f66facfbbab6c6
