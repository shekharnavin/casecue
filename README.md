# CaseCue

A React Native app with a local login flow, Settings-based user and case management for High Court, NCLT, and DRT matters, saved case numbers, WhatsApp-ready hearing updates, and live Karnataka High Court hearing lookup through a local proxy.

## Run locally

```bash
npm install
npm run server
npm start
```

For browser preview:

```bash
npm run web -- --localhost --port 8096
```

Sample local case:

- Bench: Bengaluru Bench
- Case Type: WP
- Case Number: 17880
- Case Year: 2024
- Captcha: read the live image shown in the app

The app calls the local proxy at `http://localhost:4005`, which keeps the court website session cookie, fetches the live captcha image, submits the case details to `https://judiciary.karnataka.gov.in/casestatus.php`, and parses the response.

Captcha should stay user-entered rather than automated.

Login is handled by the local server against accounts stored in `server/scheduler-data.json` (passwords are scrypt-hashed). A fresh install is seeded with an admin account:

- Login ID: `admin`
- Password: `password123`

Change it right away from Settings → Change my password (the app shows a banner until you do). As an admin, use the Recipients page to add local users with login ID, email ID, and phone number, then assign High Court, NCLT, DRT, NCLT/NCLAT, or eCourts case numbers to those users.

After a case result is shown, use "Share on WhatsApp" to generate a formatted CaseCue hearing update. Normal WhatsApp links open one chat at a time with the message prefilled; the user still taps Send inside WhatsApp. Fully automatic WhatsApp delivery to all saved users requires WhatsApp Business API credentials.

Live lookup is currently connected for Karnataka High Court. NCLT and DRT can be saved and managed in the same case table while their separate portal adapters are added.

The local backend also runs a daily scheduler at 5:00 PM server local time. It reads saved users and saved cases from `server/scheduler-data.json`, checks available case-detail adapters, and creates a local notification outbox item when a saved case has a hearing tomorrow. Use the Settings page button "Run Check Now" to trigger the same check manually while developing.

### Email (SMTP) delivery

CaseCue emails a case's recipients whenever its tracked hearing details change (and once when tracking starts). Configure the sending mailbox in the app: Settings → Email (SMTP) settings (admin only). Enter host, port, username, and an **app password** (for Gmail/Outlook use an app password, not the account password), then use "Send test email" to confirm. Settings are saved in `server/scheduler-data.json`.

When running from source you can alternatively set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` in `server/.env`; the in-app settings take precedence when present.

## Build a Windows release

```bash
npm install
npm run dist
```

This builds the React UI and packages everything (Electron shell + local Node server + Tesseract OCR data) into `release/`:

- `release/win-unpacked/CaseCue.exe` — the ready-to-run app (also zipped as `CaseCue-<version>-win-x64-portable.zip`; unzip anywhere and run).
- `CaseCue Setup <version>.exe` — the NSIS installer.

The app launches its own bundled server on `http://localhost:4005`, so end users never run npm commands. Per-user data (accounts, saved cases, SMTP settings) lives in the user's profile at `%APPDATA%/casecue/scheduler-data.json`, kept out of the read-only install directory.

**Installer prerequisite:** electron-builder's code-signing helper unpacks files that contain symlinks, which Windows only allows with the right privilege. If `npm run dist` fails with *"Cannot create symbolic link … A required privilege is not held by the client"*, either turn on **Settings → Privacy & security → For developers → Developer Mode** (then re-run — no admin needed), or run the build from an **Administrator** terminal. The portable `win-unpacked` build is produced even without this; only the `Setup .exe` needs it.

Captcha-protected courts cannot be checked unattended by the scheduler unless an official/captcha-free data source is added. Today, the scheduler can evaluate the local DRT reference case data and will skip Karnataka High Court saved cases with a clear reason until that adapter exists.

The DRT flow currently includes the reference case from `DRT case.jpg`:

- Tribunal: Debts Recovery Tribunal Bangalore (DRT 2)
- Case: OA/1050/2022
- Diary No/Year: 1965/2021
- Next Listing Date: 08/06/2026
- Purpose: SUMMONS
