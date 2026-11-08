# Post Pack Builder: setup (about 15 minutes)

Core posts in -> repurposed for LinkedIn, Instagram and Facebook -> one zip out (emailed + saved in Drive).

## What is in this folder
| File | Purpose |
|---|---|
| `Code.gs` | Menu, Sheet tabs, Settings, Formats, helpers |
| `Import.gs` | Paste / upload / zip / Drive Inbox import, parsing, validation |
| `Render.gs` | Starter templates, tag filling, caption builders, per-post rendering |
| `Pack.gs` | Batch building (chunked), report, zip, email, sample pack |
| `Seed.gs` | Two tiny blank decks used to create templates at the right page size. Do not edit |
| `Import.html` | The import dialog |
| `appsscript.json` | Turns on the Drive and Slides advanced services; sets the timezone |
| `sample_core_posts.txt`, `sample_core_posts.json` | Test input |

## Install
1. Create a new Google Sheet. Name it "Post Pack Builder".
2. **Extensions > Apps Script.**
3. Create one script file per `.gs` file above (the **+** next to Files > Script), paste each in, and keep the file names. Add an HTML file named **Import** and paste `Import.html` into it.
4. Project Settings (gear) > tick **Show "appsscript.json" manifest file**, open it, and replace its contents with the supplied `appsscript.json`. Change `timeZone` if needed. (This enables the Drive and Slides advanced services. If you prefer clicking: Services **+** > Drive API v3 and Slides API v1.)
5. Save, reload the Sheet. A **Post Pack Builder** menu appears.

## First run
1. **Post Pack Builder > 1. Set up sheets and folders.** Approve the permission prompts (Sheets, Drive, Slides, Gmail send, external requests). It creates the tabs (Posts, Formats, Templates, Placeholders, Settings, Log) and a Drive folder called "Post Pack Builder".
2. Open **Settings** and fill in at least BrandName, Handle, the four BrandColor rows and DefaultCTA. Optional: LogoFileId (paste a Drive link to your logo), DefaultHashtags, DeliveryEmail (blank = your own account).
3. **Post Pack Builder > 2. Create starter templates.** It creates nine Google Slides templates (Bold, Classic, Clean x Carousel, Card, Square Card) in your brand colors and sets Bold as the active template for each format. This takes a minute or two. If it stops early, run it again; it only creates what is missing.
4. Open the **Templates** tab and click Open next to any template to look at it. Edit freely; keep the `{{tags}}` (see the Placeholders tab).
5. **Post Pack Builder > Email me a sample pack.** You get a zip with sample posts rendered through your active templates. Look at every image. Do this again after every template change.

## Everyday use
1. **Post Pack Builder > Import posts.** Paste core posts, or upload `.txt/.md/.json/.csv` files, or a `.zip` of them (images in the zip can be used by posts that name them). Leave "Build the pack right after importing" ticked.
2. You get an email with the zip (or a Drive link if it is too big to attach), and every post in the Posts tab shows Rendered, Partial or Error with the reason in Notes.
3. Fix an Error row (edit the text) and set its Status back to **Queued**, then **Build pack now**. Set a row to **Hold** to skip it.

Other ways in: set InboxFolderId in Settings (a Drive folder), drop files in it, and use **Import from Drive Inbox and build**.

## Core post format
Plain text (see `sample_core_posts.txt`):
```
POST
Series: Missed Call Monday
Hook: I lose a job every time I miss a call on the truck.
Points:
- On the truck, the phone rings and you cannot answer
- After hours, the caller tries the next company
CTA: Save this for your next team meeting.
Hashtags: #tradesbusiness #smallbusiness
---
POST
...
```
JSON is also accepted (`sample_core_posts.json`), as is CSV with a header row (`hook,points,cta,...`, points separated by ` | `).

Fields: `hook` (required), `points` (3-8 for carousels), `body`, `cta`, `series`, `quote`, `attribution`, `hashtags`, `image`, `platforms`, `formats`, `template`, `pillar`, `framework`.

## What each core post becomes
| Platform | Format | Files |
|---|---|---|
| LinkedIn | `linkedin_text` | post copy `.txt` |
| LinkedIn | `linkedin_carousel` | PDF + caption `.txt` (PNGs too if IncludePNGForLinkedIn = TRUE) |
| Instagram | `instagram_carousel` | slide PNGs + caption `.txt` |
| Instagram | `instagram_single` | card PNG + caption `.txt` |
| Facebook | `facebook_post` | post copy `.txt` + square card PNG |
| Facebook | `facebook_multi` (off by default) | slide PNGs + post copy `.txt` |

Turn formats on or off in the **Formats** tab. A post can narrow itself with `platforms: linkedin` or `formats: linkedin_text instagram_single`. The Formats tab also holds each platform's caption limit, hashtag defaults and maximum, and link line ("Link in bio."). The starter limits come from public platform guides; check them occasionally.

## Using your own template designs
Any Slides deck works if you add a row in **Templates** (name, link or ID, and Kind: `carousel`, `card` or `card_square`) and put `{{tags}}` in it. Slide roles are detected from the tags:
- a slide containing `{{slide_text}}` is cloned once per point (use `{{slide_number}}` on it too)
- a slide with `{{hook}}` is the cover
- a slide with only `{{cta}}` is the closing slide (dropped if there is no CTA)
- a slide with `{{quote}}` is a card

Put each tag in its own text box if you want the text to shrink automatically when it is long. `{{logo}}` and `{{image}}` boxes are replaced by the picture (or removed if there is none). A mistyped tag shows as raw text and the sample pack email warns about it. Then pick your template in the **Formats** tab (ActiveTemplate column).

## Limits to know about
- **Page size:** Slides cannot be resized by script, so new decks are created from tiny seed files at 8 x 10 in (4:5) and 8 x 8 in (1:1). If the Drive advanced service is off, decks are created at 16:9 instead; the Notes column says so. Fix: File > Page setup > Custom, then **Rebuild layouts in starter templates**.
- **PNG size:** images come from Slides thumbnails, about 1600 px wide (so 1600 x 2000 for 4:5), not exactly 1080 wide. Platforms accept and rescale them.
- **No video files** and no publishing to the platforms in this version.
- **Time limit:** Apps Script stops a run at about 6 minutes. Big batches continue automatically (a trigger fires about a minute later), and the zip is built and emailed when the last post finishes.
- **Zip size:** batches are split into several zips of about MaxZipMB each. If the total is over about 24 MB, the email carries Drive links instead of attachments.
- **Import size:** the import dialog accepts about 7 MB in one go. For more, use the Drive Inbox.
- **Never silently edited:** text is not rewritten or trimmed. Too-long hooks and slides are rejected at import; over-long captions and extra hashtags are flagged in the report (extra hashtags are cut to the platform maximum).

## Not yet tested in Google's environment
This was written and tested with mocked Drive and Slides objects, not inside Google Apps Script itself. The riskiest points, in order: (1) creating the Slides decks from the seed files via the Drive API, (2) PNG export through Slides thumbnails, (3) visual spacing of the starter layouts (check the sample pack). If something fails, the Notes column, the Log tab and the email say what happened; send me that text.
