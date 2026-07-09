# Stress-test import file

## File

`oryx-stress-test-export.xlsx` — Excel workbook matching the System Backup export layout (Clients, Jobs, Quotes sheets).

## How to import

1. Log in as **Admin**
2. Go to **System Backup** (`/backups`)
3. Click **Import Excel** and choose `fixtures/oryx-stress-test-export.xlsx`
4. Wait for the import result panel (large files may take up to 60s on Vercel)

Regenerate the file anytime:

```bash
npm run generate:stress-export
# or larger dataset:
node scripts/generate-stress-test-export.mjs --clients=100 --jobs=500 --quotes=100
```

## Scenario rows (search `STRESS-` in Jobs)

| Drawing number | What to verify |
|----------------|----------------|
| `STRESS-DUE-COMPLETE` | Complete + due this week → **not** in Due This Week KPI |
| `STRESS-DUE-ACTIVE` | In progress + due this week → **in** Due This Week KPI |
| `STRESS-MAP-PARENT` | Original complete job → map pin after geocode |
| `STRESS-MAP-PARENT Rev A` | Revision → **no** separate map pin |
| `STRESS-MAP-FULL` | Full UK postcode → auto-locate queue (Ready for auto) |
| `STRESS-MAP-VAGUE` | Single-line vague address → Needs manual queue |
| `STRESS-MAP-IE` | Ireland address → auto-locate test |

After import, on **Job Map** (admin): run **Find Missing Locations**, then check **Missing Locations** filter tabs.

## Notes

- JSON backups from **Export JSON** are for download/restore only — use **Import Excel** for bulk data load.
- Re-importing updates rows matched by drawing number / client name / quote number.
- Default volume: 50 clients, 200 jobs, 50 quotes (plus 7 scenario jobs).
