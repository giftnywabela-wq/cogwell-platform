# Cogwell Platform: one project, one URL, one login

Seven separate Apps Script projects are now **one** Apps Script project with **one** web app URL and **one** sign-in.

```
index.html            The Cogwell OS shell (static; host on GitHub Pages as before). Only needs API_URL now.
knowledge/  hub/      Static content (playbooks, scripts, trackers, delivery hub). Unchanged.
apps-script/          THE backend. Paste/push this whole folder into ONE Apps Script project.
  00_OS.gs            Shared runtime: who is signed in, each module's spreadsheet, namespaced properties
  10_core.gs          OS shell backend (leads, calls, deals, invites, inbox) - was core/
  20_platform.gs      Client portal + AI intake - was platform/ (5 files merged)
  30_invoicing.gs     Invoicing
  40_linkqueue.gs     WhatsApp queue + lead engine (Code.gs + Engine.gs)
  50_scoreboard.gs    Team scoreboard
  60_poststudio.gs    Post Studio
  70_packbuilder.gs   Post Pack Builder
  99_Main.gs          The single router: doGet / doPost / osApi, triggers, setup helpers
  page_*.html         One page per module; login.html is the sign-in fallback
  widget.js           Website chat widget (host on the client's site, point it at the same URL)
```

## Setup (about 10 minutes)

1. script.google.com > **New project**. Add every file from `apps-script/` (or `clasp push`; copy `.clasp.json.example` and set your scriptId). Enable the manifest file and use `appsscript.json` as is. Keep the file order shown above.
2. Project Settings > Script properties: add `GEMINI_KEY` (AI chat) and, for the lead engine, `API_KEY` (Places) if you use them.
3. Run **`setupAll()`** once and approve the permissions. It creates every sheet, makes *you* the owner login and installs the platform and scoreboard triggers. The log lists the sheet IDs.
4. **Deploy > New deployment > Web app.** Execute as: **Me**. Access: **Anyone**.
5. Paste the `/exec` URL into `API_URL` at the top of `index.html`. That is the only link you paste now.
6. Sign in on the site with your emailed code. Invite your team from the Invites page (role `team` for reps).
7. Optional, when needed: `platformBootstrap()` (first client tenant), `linkQueueConfigure()` then `linkQueueEngine()` (lead engine), `packBuilderCreateTemplates()` (starter slide templates). Post Studio's template setup is the button on its page.

If you already have data, do not run setup blind: point a module at its existing sheet first with
`linkSheet('invoicing', 'ID')`, `linkSheet('scoreboard', 'ID')`, `linkSheet('packbuilder', 'ID')`, `linkSheet('linkqueue', 'ID')`, `linkCoreSheet('ID')`, `linkPlatformSheet('ID')`. Then run `setupAll()`, which only adds what is missing.

## What changed, on purpose

| Before | Now |
|---|---|
| 8 URLs pasted into CONFIG | 1 URL (`API_URL`). Modules open at `API_URL?m=linkqueue`, `scoreboard`, `content`, `packbuilder`, `invoices`, `platform` |
| Google-account sign-in on queue and scoreboard, a passcode on invoicing, email codes on core and the portal | One email-code sign-in (the OS login). Roles: `owner` sees everything, `team` gets queue, scoreboard, Post Studio, Post Pack Builder. Invoicing is **owner only** |
| Command Center fetched platform numbers over HTTP with a shared `OS_KEY` | Read in-process. `PLATFORM_URL` is no longer needed |
| Two modules both used `SHEET_ID` | Now `CORE_SHEET_ID` and `PLATFORM_SHEET_ID`. Sheet-bound modules use `SS_<MODULE>` properties |
| Embedding put nothing sensitive in URLs | Pages open with a one-use, 2-minute ticket; the session itself is never in a URL |
| Sheet menus (Post Pack, Scoreboard, Invoicing) | Editor-run functions in `99_Main.gs` (`packBuilderBuildNow`, `scoreboardSendNow`, `invoicingSetLogo`, ...) |

Hardening added while merging: sign-in codes lock after 5 wrong tries; the public invoice link rejects anything but a plain token (the old page echoed the raw parameter into a script block); browsers can only call functions on an explicit allowlist (`API_` in `99_Main.gs`), and each module has its own role requirement; the portal's trigger installer no longer deletes other modules' triggers.

## Things to know before you rely on it

- **I could not run this inside Google.** I tested it against a mock Apps Script runtime: all files load together, every page call is allowlisted, every page script parses, and sign-in, tickets, role checks and several real module calls work. Services I did not simulate (Slides, Drive, Gmail, Places, Calendar, Gemini) are untested. Do a click-through of each module after deploying.
- **Retire the old projects' triggers** (or delete the old projects) once you switch, otherwise scoreboard emails, lead pulls and portal automations will run twice.
- **Lead engine, second account:** the engine split its Places API quota across two Google accounts (labels A and B). This merged project is account A. To keep account B, deploy the same project in the second account, set `ACCOUNT_LABEL=B` and `MASTER_ID` there, and run `linkQueueEngine()`.
- Reps must still be listed on the queue's **Team** tab, and on the scoreboard's **Users** tab, as before. The OS owner is always a queue admin.
- Execution now runs as you (the deployer) for everything, including Post Studio, which used to be "only myself". Access is gated by the sign-in instead.
- `post_pack_builder.zip` and `post-studio.zip` from the old folders were duplicate packagings of code that is now inside `apps-script/`, so they are not included.
- The database is still one sheet per module (tab names collide across modules: `Users`, `Leads`, `Tasks`). Merging them into a single spreadsheet is a sensible next step, but it means migrating data, so I left it alone.
