# AJR Pre-Loved Finds

A personal shop for pre-loved items, built with plain HTML, CSS and JavaScript. There is no framework and no build step. The listings live in a Google Sheet, and buyers reach out through Messenger.

- **Version:** v0.1.3 (27 November 2026)
- **Name:** "AJR Pre-Loved Finds", for now. To change it, edit `index.html` (the `<title>` and the brand link: `aria-label` and `.brand-name`) and this README.

## What's on the page

| Part | What it does |
| --- | --- |
| Header | Shop name and a Message me button (Messenger) |
| Intro | Short headline and how many items are available right now |
| Shop | Search, sort, a "Show sold items" switch, category tags and the item grid |
| Item pop-up | All photos, price, condition, description, an **Inquire on Messenger** button and a link you can copy and share |
| Found a new home | Sold items, with a SOLD stamp |
| How it works | Three short steps for buyers |

## Files

```
index.html          Page content and structure (also holds the security policy)
styles.css          Colours, fonts, layout, responsive rules
script.js           Loads the listings, search/filter/sort, item pop-up, Messenger link
data/items.csv      The saved copy of the listings (also used until a sheet is connected)
assets/
  favicon.svg       Tab icon and header logo
  placeholder.svg   Shown for items with no photo
  items/            Item photos (the sample-*.jpg files are stand-ins: delete them)
```

## Run it locally

Browsers will not load `data/items.csv` from a file opened directly, so serve the folder instead:

```
python3 -m http.server 8000
```

Then open http://localhost:8000. Fonts need an internet connection.

## The Google Sheet

Row 1 is the header. Keep these column names exactly (any order, extra columns are ignored):

| Column | What goes in it |
| --- | --- |
| `id` | A short unique code, like `A001`. Used in the item link, so do not change it after sharing a link. |
| `title` | Item name. Rows without a title are skipped. |
| `price` | A number in pesos, like `650`. Blank shows "Ask for price"; `0` shows "Free". |
| `category` | Any word or two, like `Clothing`. Each different category becomes a tag. |
| `condition` | Plain words, like `Like new`, `Good`, `Fair`. Be honest: it builds trust. |
| `description` | Details, flaws, size. A line break (Alt+Enter in a cell) starts a new paragraph. |
| `status` | `Available`, `Reserved`, `Sold` or `Hidden`. Blank means Available. Hidden rows never show. |
| `photos` | File names from `assets/items/`, separated by `|`, like `jacket-1.jpg\|jacket-2.jpg`. The first is the cover. Blank shows the placeholder. |
| `added` | The date you listed it, like `2026-11-27`. Used for "Newest first". |

### Start from the starter file

`ajr-pre-loved-finds-sheet.xlsx` (delivered next to this project, not inside the site folder) has the right columns, a Status dropdown, date and price formats, a frozen header row and a "How to use" tab.

1. In Google Sheets, create a blank spreadsheet and choose **File → Import → Upload**, then pick the file.
2. Choose **Replace spreadsheet** and **Import data**.
3. Rename the file "AJR Pre-Loved Finds" and delete the sample rows when you add your own.

### Connect the sheet

1. In Google Sheets, open **File → Share → Publish to web**.
2. Choose the tab with your listings (not "Entire document") and the format **Comma-separated values (.csv)**, then **Publish**.
3. Copy the link and paste it into `sheetCsvUrl` at the top of `script.js`.
4. Push to GitHub. From now on, changes in the sheet show up on the site within about five minutes, with no push.

Anyone with the link can read the published tab, so keep private notes (like what you paid) in a different tab.

### Keep the saved copy fresh

In Sheets, **File → Download → Comma-separated values (.csv)**, save it over `data/items.csv` and push. The site uses this copy only when the live sheet cannot be reached.

## Photos

1. **Resize before uploading.** Phone photos are 3 to 4 MB each, and the pop-up loads every photo of an item, so one item could cost a visitor 20 MB. Aim for about **900 px wide by 1200 px tall (the usual 3:4 phone shape), under 200 KB each**, as `.jpg` or `.webp`. The page crops photos to 4:5 around the centre, so keep the item in the middle of the frame. [Squoosh](https://squoosh.app) does this in the browser.
2. **Remove location data.** A phone photo records the exact GPS spot it was taken, the camera model and the time. Anything in a public GitHub repo can be read by anyone, so a photo taken at home shows where home is. Re-saving the photo with Squoosh or any resize tool drops this data. To check a file on Windows, right-click it, choose Properties, then Details: there should be no GPS section. You can also turn off "Location tags" in your phone's camera settings.
3. Put the files in `assets/items/` and write their names in the sheet's `photos` column. Name them after the item, like `A001-01.jpg`, `A001-02.jpg`.
4. File names can use letters, numbers, spaces, dots, dashes and underscores. Use `.jpg`, `.png`, `.webp`, `.avif`, `.gif` or `.svg`.

Adding a photo needs a push to GitHub. Price, status and text changes do not.

## How loading works

1. **Live sheet**, if `sheetCsvUrl` is set. A copy of each good load is kept on that device.
2. **The copy that device saved last time**, if the sheet cannot be reached.
3. **`data/items.csv`**, if neither works. The page shows a short notice for steps 2 and 3.

If all three fail, the page asks visitors to message you instead of showing a blank screen.

## Messenger

The Inquire button opens `https://m.me/<your username>` with a ready-made message ("Hi! Is the "Denim jacket" (A001, ₱650) still available?"). Messenger does not always fill the box from a link, so the button also copies the message and tells the visitor to paste it if the box is empty. Set your username with `messengerUser` in `script.js`.

## Settings

Everything you may want to change is in the `CONFIG` block at the top of `script.js`: Messenger username, sheet link, folders, currency and how long to wait for the sheet. Colours and fonts are variables at the top of `styles.css`.

## Security

`index.html` has a Content Security Policy that lists what the page may load. It allows this site, Google Fonts and Google Sheets (for the live listings). If you add something new (analytics, an embed), add its address to the policy, or the browser will block it. The page puts sheet text on screen with `textContent` only, and photo names are checked so a cell cannot point at another site or folder.

## Still to do

- [ ] Confirm the Messenger username in `script.js`
- [ ] Write the intro paragraph in your own words
- [ ] Decide how deals work (payment, meetup spots, shipping) and update "How it works"
- [ ] Replace the sample rows in `data/items.csv` and the sheet, and delete `assets/items/sample-*.jpg`
- [ ] Create the Google Sheet, publish it, and paste the link into `script.js`
- [ ] Add share-preview tags (`og:title`, `og:description`, `og:image`, `og:url`) once the site has its address. Link previews show the shop in general, not one item.
- [ ] Create the GitHub repo and Cloudflare Pages project
- [ ] Link it from AJR Dev Log as a project card (the CSP for that is a separate step)

## Publish

Same as your other sites: push to the `main` branch of a GitHub repo and let Cloudflare Pages deploy it. After changing the share image or description, re-scrape the page in the Facebook Sharing Debugger.

## Release history

- **v0.1.3 (2026-11-27):** The 11 real item photos were shrunk from 23.3 MB to 1.4 MB and their GPS and camera data removed (same file names, so the CSV is unchanged). Added the photo and location guidance above.
- **v0.1.2 (2026-11-27):** First real listings (the JJK Banpresto figures and the Gundam Barbatos kit) and the intro wording, by Anthony.
- **v0.1.1 (2026-11-27):** Shop name set to "AJR Pre-Loved Finds". The header now wraps cleanly on narrow phones. Added the Google Sheets starter file.
- **v0.1 (2026-11-27):** First backbone. Google Sheet CSV loader with saved-copy fallback, search, category tags, sort, sold section, item pop-up with shareable links, Messenger inquiry, sample data and photos.
