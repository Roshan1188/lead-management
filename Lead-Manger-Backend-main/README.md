# Lead Management Backend (Node.js + Express + MongoDB + Cloudinary)

Roles:
- **Telecaller (role = 1)**
- **Admin (role = 2)**

Auth:
- Mobile OTP login (hardcoded OTP: `123456`)
- JWT-based auth with role-based guards

Core Features:
- Create Lead (single), Bulk Upload (JSON & CSV), Meta Lead
- Lead Types: `create` | `bulk` | `meta` (stored in `leadType`)
- Lead Status: `initialize` | `followup` | `failed` | `success`
- Follow-up history with `reason`, `nextFollowDate`
- Telecaller dashboard (counts), today's reminders (by timezone)
- Admin dashboard (totals), add telecaller/admin users
- Lead distribution: **shuffle** / **sequence** (round-robin) / **date**
- Cloudinary upload for lead attachments & user avatar
- Simple reporting endpoints for Admin + Telecaller

## Quick Start

```bash
cp .env.example .env
# Fill .env values for Mongo, JWT, Cloudinary

npm install
npm run dev
# API on http://localhost:5000
```

## File Structure
```
/config        # DB connection
/middleware    # auth & role guards
/models        # Mongoose schemas
/routes        # Express routers (no controllers per requirement)
/utils         # cloudinary + distribution + date utils
index.js       # App entry
```

## Notable Endpoints

### Auth
- `POST /api/auth/send-otp` → { mobile } (returns `{ sent: true }`)
- `POST /api/auth/login` → { mobile, otp } (returns `{ token, user }`)
- `GET /api/auth/me` (auth)
- `PUT /api/auth/profile` (auth) — update name & optional avatar (multipart `avatar`)

### Telecaller
- `GET  /api/telecaller/dashboard` (auth, role=1)
- `GET  /api/telecaller/leads?status=&q=&page=&limit=` (auth, role=1)
- `GET  /api/telecaller/reminders?tz=Asia/Kolkata` (auth, role=1)
- `POST /api/telecaller/update-status/:id` (auth, role=1) — { status, reason, followUpDate }
- `GET  /api/telecaller/report?from=YYYY-MM-DD&to=YYYY-MM-DD` (auth, role=1)

### Admin
- `GET  /api/admin/dashboard` (auth, role=2)
- `GET  /api/admin/telecallers` (auth, role=2)
- `POST /api/admin/add-telecaller` (auth, role=2)
- `POST /api/admin/create-admin` (auth, role=2)
- `POST /api/admin/distribute` (auth, role=2) — { method: "shuffle"|"sequence"|"date" }
- `GET  /api/admin/reports/telecallers?from=&to=` (auth, role=2)
- `GET  /api/admin/reports/leads?from=&to=` (auth, role=2)

### Leads (General)
- `POST /api/leads/create` (auth) — Single create (leadType = "create")
- `POST /api/leads/bulk-json` (auth) — { leads: [...] } (leadType = "bulk")
- `POST /api/leads/bulk-csv` (auth, multipart `file`) — CSV columns: name,phone,email
- `POST /api/leads/meta` (auth) — (leadType = "meta")
- `GET  /api/leads` (auth, admin lists all; telecaller sees own)
- `GET  /api/leads/:id` (auth)
- `GET  /api/leads/:id/history` (auth)
- `POST /api/leads/:id/upload` (auth, multipart `files[]`) — upload attachments to Cloudinary
- `PUT  /api/leads/:id` (auth)
```

## CSV Bulk Example

```csv
name,phone,email
Ravi Kumar,9876543210,ravi@example.com
Neha Sharma,9123456780,neha@example.com
```

## Notes
- First admin can be created via `/api/admin/create-admin` (requires an existing admin; for very first time, temporarily set a user in DB or expose a guarded bootstrap route).
- This code avoids controller layer as requested; routes contain handlers directly.
