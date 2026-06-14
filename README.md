# Contract Scanner

AI-powered contract risk analysis for SMBs. Upload any PDF
contract — vendor agreements, NDAs, rental agreements,
financial agreements — and get an instant risk report with
clause-by-clause analysis, plain-English explanations, and
safer rewrite suggestions.

Built with Next.js 16, Supabase, and Google Gemini 2.5 Flash.

---

## What it does

- Upload a PDF contract (drag-and-drop or click)
- AI analyses every clause for legal and financial risk
- Returns a risk score (0-100), letter grade, and executive summary
- Shows each risky clause with: severity badge, plain-English
  explanation, and a safer alternative you can copy
- Filter clauses by category (Payment, Liability, Auto-Renewal,
  IP, Termination) and severity (High, Medium, Low)
- Click any clause to jump the PDF viewer to that page
- Download a professional PDF risk report
- Receive an email summary after each scan
- Re-analyse any contract without re-uploading
- Works on documents up to 500+ pages via parallel analysis

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Styling | Tailwind CSS + shadcn/ui |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Storage | Supabase Storage |
| AI Analysis | Google Gemini 2.5 Flash |
| PDF Rendering | react-pdf |
| PDF Export | jsPDF |
| Email | Resend |
| Deployment | Vercel |

---

## Prerequisites

Before you begin, make sure you have:

- **Node.js 20+** — https://nodejs.org
  Check: `node --version` (must show v20.x.x or higher)

- **pnpm** — Fast Node.js package manager
  Install: `npm install -g pnpm`
  Check: `pnpm --version`

- **Git** — https://git-scm.com
  Check: `git --version`

---

## External services you need to set up

You need accounts on four services. Set these up before
running the app locally.

### 1. Supabase (database, auth, and file storage)

1. Go to https://supabase.com and sign up
2. Click New Project
3. Name it contract-scanner
4. Choose a region close to your users
5. Save your database password somewhere safe
6. Wait ~2 minutes for provisioning
7. Go to Settings -> API and copy:
   - Project URL -> NEXT_PUBLIC_SUPABASE_URL
   - anon public key -> NEXT_PUBLIC_SUPABASE_ANON_KEY
   - service_role key -> SUPABASE_SERVICE_ROLE_KEY

After creating the project, run the database schema:
- Go to SQL Editor in your Supabase dashboard
- Paste and run the contents of supabase/schema.sql

### 2. Google Gemini API (AI analysis)

The app uses a Google Cloud service account for Gemini
authentication (more reliable than API keys).

1. Go to https://console.cloud.google.com
2. Create a new project or select an existing one
3. Enable the Generative Language API:
   Search for it in the API Library and click Enable
4. Go to IAM & Admin -> Service Accounts
5. Click Create Service Account
   - Name: gemini-contract-scanner
   - Role: Generative Language API User
6. Click on the service account -> Keys -> Add Key -> JSON
7. Download the JSON file and save it somewhere safe
   (NOT inside the project folder)

You will need this JSON file as an environment variable.

### 3. Resend (email reports) — optional

Without Resend, the app works fully except email reports
are silently skipped.

1. Go to https://resend.com and sign up
2. Go to API Keys -> Create API Key
3. Copy the key -> RESEND_API_KEY

### 4. Vercel (deployment) — optional for local development

Only needed if you want to deploy publicly.
Sign up at https://vercel.com when ready.

---

## Installation

### Clone the repository

Mac / Linux:
```bash
git clone https://github.com/sohamsantra2003-cmd/contract-scanner.git
cd contract-scanner
```

Windows (PowerShell):
```powershell
git clone https://github.com/sohamsantra2003-cmd/contract-scanner.git
cd contract-scanner
```

### Install dependencies

```bash
pnpm install
```

This automatically copies the PDF rendering worker to /public
via the postinstall script. No manual steps needed.

### Set up environment variables

Mac / Linux:
```bash
cp .env.local.example .env.local
```

Windows (PowerShell):
```powershell
Copy-Item .env.local.example .env.local
```

Open `.env.local` and fill in your values (see below).

### How to set GOOGLE_SERVICE_ACCOUNT_JSON

The service account JSON must be on a single line with no
newlines. Use one of these commands:

**Mac / Linux:**
```bash
python3 -c "import json,sys; print(json.dumps(json.load(open('/path/to/your-service-account.json'))))"
```
Copy the output and paste it as the value of
`GOOGLE_SERVICE_ACCOUNT_JSON` in `.env.local`

**Windows (PowerShell):**
```powershell
$json = Get-Content 'C:\path\to\your-service-account.json' -Raw
$compact = ($json | ConvertFrom-Json | ConvertTo-Json -Compress -Depth 100)
Write-Output $compact
```
Copy the output and paste it as the value.

---

## Database setup

Run this SQL in the Supabase SQL Editor
(SQL Editor -> New Query -> paste -> Run):

The full SQL is in `supabase/schema.sql` in this repository.
Paste the entire file contents and run it.

It creates:
- `public.users` table
- `public.contracts` table
- `public.scans` table
- Row Level Security policies on all tables
- Auto-create user trigger on signup

### Set up Supabase Storage

In your Supabase dashboard, go to Storage and:

1. Create a bucket called `contracts`
2. Set it to **Private** (not public)
3. Go to Policies and run the storage policies from
   `supabase/schema.sql` (the section at the bottom)

### Configure Supabase Auth

In your Supabase dashboard, go to
Authentication -> URL Configuration:

For local development:
- Site URL: `http://localhost:3000`
- Redirect URLs: `http://localhost:3000/auth/callback`

For production (update after deploying to Vercel):
- Site URL: `https://your-app.vercel.app`
- Redirect URLs: `https://your-app.vercel.app/auth/callback`

---

## Run locally

```bash
pnpm dev
```

Open http://localhost:3000

---

## How to use

1. Sign up with your email address
2. Confirm your email via the link sent to your inbox
3. Upload a contract — drag-and-drop or click Upload
   (PDF only, up to 10MB)
4. Click "Analyse contract" to start the AI scan
5. Watch the live streaming analysis as Gemini processes
   the document
6. Review the risk report: score, grade, summary,
   and clause-by-clause breakdown
7. Filter clauses by category or severity
8. Click any clause card to jump the PDF to that page
9. Copy safer rewrites with one click
10. Download the PDF report for sharing with clients
11. Check your email for an automated risk summary
12. Re-analyse any contract after improvements

---

## Document size handling

The app handles documents of any size automatically:

| Document size     | Analysis method                        |
|-------------------|----------------------------------------|
| Up to ~15 pages   | Single Gemini call                     |
| 15-90 pages       | Two-pass (clauses then summary)        |
| 90-500 pages      | Parallel chunked analysis              |
| Scanned PDFs      | Error with conversion guidance         |
| Password-protected| Error with unlock guidance             |

---

## Deployment to Vercel

### 1. Push to GitHub

```bash
git push origin main
```

### 2. Import to Vercel

Go to https://vercel.com/new and import your GitHub repository.

### 3. Add environment variables

In Vercel -> Project -> Settings -> Environment Variables,
add all variables from your `.env.local`.

**CRITICAL for `GOOGLE_SERVICE_ACCOUNT_JSON`:**
The value must be compacted to a single line with no newlines.
Use the compaction commands from the Installation section above.

Mark these as Secret in Vercel:
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `RESEND_API_KEY`

After first deployment, update `NEXT_PUBLIC_APP_URL` to your
actual Vercel URL (e.g. `https://contract-scanner-xyz.vercel.app`)

### 4. Update Supabase Auth URLs

Go to Supabase -> Authentication -> URL Configuration:
- Site URL: your Vercel URL
- Redirect URL: your Vercel URL + `/auth/callback`

### 5. Verify deployment

Visit `https://your-url.vercel.app/api/ping`
Should return: `{ "status": "ok" }`

---

## Project structure

```
contract-scanner/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── contracts/reset-status/  # Re-analyse endpoint
│   │   │   ├── ping/                    # Health check + warmup
│   │   │   ├── scan/                    # Cached scan return
│   │   │   ├── scan-stream/             # Streaming analysis (SSE)
│   │   │   └── send-report/             # Email report via Resend
│   │   ├── auth/callback/               # Auth redirect handler
│   │   ├── dashboard/
│   │   │   ├── contracts/[id]/          # Contract detail page
│   │   │   └── page.tsx                 # Contracts list
│   │   ├── login/                       # Sign in page
│   │   └── signup/                      # Sign up page
│   ├── components/
│   │   ├── ContractViewer.tsx           # Shared state wrapper
│   │   ├── ContractRow.tsx              # Dashboard list item
│   │   ├── DeleteContractButton.tsx     # Delete with confirm
│   │   ├── ErrorBoundary.tsx            # Production error UI
│   │   ├── PDFViewer.tsx                # react-pdf viewer
│   │   ├── RiskPanel.tsx                # Risk analysis UI
│   │   └── UploadZone.tsx               # PDF upload UI
│   └── lib/
│       ├── chunk-document.ts            # Parallel chunking logic
│       ├── export-pdf.ts                # jsPDF report builder
│       ├── gemini.ts                    # Gemini API client
│       ├── scan-utils.ts                # Shared scan helpers
│       └── supabase/                    # Supabase clients
├── scripts/
│   └── copy-pdf-worker.js               # Postinstall automation
├── public/
│   └── pdf.worker.min.mjs               # pdfjs worker (auto-copied)
├── supabase/
│   └── schema.sql                       # Full database schema + RLS
├── .env.local.example                   # Environment variable template
├── .gitignore
├── vercel.json                          # Vercel deployment config
└── CLAUDE.md                            # AI development rules
```

---

## Environment variables reference

| Variable                        | Required    | Description                              |
|---------------------------------|-------------|------------------------------------------|
| NEXT_PUBLIC_SUPABASE_URL        | Required    | Supabase project URL                     |
| NEXT_PUBLIC_SUPABASE_ANON_KEY   | Required    | Supabase anon/public key                 |
| SUPABASE_SERVICE_ROLE_KEY       | Required    | Supabase service role key (secret)       |
| GOOGLE_SERVICE_ACCOUNT_JSON     | Required    | GCP service account JSON (single line)   |
| GOOGLE_CLOUD_PROJECT            | Required    | GCP project ID                           |
| RESEND_API_KEY                  | Optional    | Email reports via Resend                 |
| NEXT_PUBLIC_APP_URL             | Optional    | App URL for email links                  |

---

## Troubleshooting

**PDF viewer is blank**
The pdfjs worker is missing. Run: `pnpm install`
The postinstall script copies it automatically.

**"Scanned PDF detected" error**
Your PDF contains images rather than selectable text.
Convert it first:
- https://smallpdf.com/pdf-to-word
- Or Adobe Acrobat: Tools -> Enhance Scans -> Recognize Text

**"Password-protected PDF" error**
Remove the password first:
- https://smallpdf.com/unlock-pdf
- Or Adobe Acrobat: File -> Properties -> Security -> No Security
- Or Google Chrome: Open PDF -> Print -> Save as PDF (removes password)

**Gemini auth fails (401 error)**
`GOOGLE_SERVICE_ACCOUNT_JSON` is not correctly formatted.
It must be a single line with no newlines.
Use the compaction command from the Installation section.

**Scan times out on very large documents**
Documents over 500 pages may exceed the 60-second function limit.
Try uploading just the main agreement body without annexes.

**Email confirmation not arriving**
Check your spam folder. Supabase free tier limits to 3 emails/hour.

**App works locally but not on Vercel**
1. Check all env vars are set in Vercel dashboard
2. Check `GOOGLE_SERVICE_ACCOUNT_JSON` is a single line
3. Check Supabase Auth redirect URLs include your Vercel domain
4. Visit `/api/ping` to verify the function is running

---

## License

MIT

---

## Built by

Soham Santra
Built in 7 days using Claude as the AI development partner.

Research thesis: A human acting as Engineering Manager paired
with an AI developer can compress a 2-3 month SaaS development
cycle into a single week.
