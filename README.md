# CV Deck

Chrome extension that keeps your CVs, cover letters, portfolio and common application answers as drag-and-drop cards. Drop them onto any job site's form: files attach, cover letters fill in the company and recipient and become a PDF, and written answers paste straight into text boxes.

## Why

When you apply to many jobs, you keep several versions of your CV, rewrite the same cover letter for each company, and type the same answers to "Why do you want to work here?" again and again. CV Deck keeps all of that one click away, on the page where you apply.

## Features

- **Works on any job site.** Drop cards onto the site's own upload boxes and text fields. CV Deck finds the file input behind upload widgets, including hidden ones.
- **Cover-letter templates.** Write a template once with placeholders such as `{{organization}}`, `{{role}}` and `{{recipient}}`. Click it, fill in the details, check the live preview, and drag it in. CV Deck generates a PDF with your name and contact details in the header. Save each filled letter as its own card if you want to keep it.
- **FAQ answers.** Write answers to common written questions once. Click a question to copy its answer, or drag it onto a text box. The company name is filled in from one shared Organization field.
- **Organized versions.** Each card has its own color and the date it was added. Click a card to preview it (all PDF pages, or an approximate DOCX preview). Right-click for color, download or delete; right-click empty space to add files.
- **Download fallback.** For sites that do not accept drag and drop, download the file and use the site's own upload button.
- **Private by design.** Everything is stored locally in Chrome. No account, no server, no network requests.

## Install

CV Deck is not on the Chrome Web Store yet, so you load it into Chrome yourself. It takes about a minute and works in Chrome, Edge, Brave and other Chromium browsers.

### 1. Download

- **Without git:** on this page, click the green **Code** button, then **Download ZIP**. Unzip it somewhere permanent, for example `Documents/cv-deck`. Chrome loads the extension from that folder, so don't delete or move it later.
- **With git:**
  ```bash
  git clone https://github.com/prasannakulkarni2510/cv-deck.git
  ```

### 2. Load it into Chrome

1. Open `chrome://extensions` in the address bar.
2. Turn on **Developer mode** (switch at the top right).
3. Click **Load unpacked** and select the folder that contains `manifest.json`. If you unzipped, that is the inner `cv-deck-main` folder.
4. Click the puzzle-piece icon in the toolbar and pin **CV Deck** so its **CV** icon stays visible.

### 3. Set it up (once)

The manager page opens after installing. You can reopen it any time from the ⚙ in the drawer, or by right-clicking the **CV** icon and choosing **Options**.

1. **Profile:** add your name, email and phone. Cover letters use them in their header.
2. **CVs:** add your CV files (PDF or DOCX, up to 10 MB each). Rename cards so you can tell versions apart.
3. **Letters:** click **New template** and write a cover letter using `{{organization}}`, `{{role}}`, `{{recipient}}` and `{{recipient_title}}`.
4. **Portfolio:** add a portfolio file, a link, or both.
5. **FAQ answers:** write your answers to the common questions. Use `{{organization}}` where the company name goes.

## Use

1. Open a job application and click the **CV** icon, or press **Alt+Shift+D**. The drawer opens on the right.
2. **CVs and portfolio files:** drag a card onto the upload box. A purple "Attach here" outline shows where it will land.
3. **Links:** drag a portfolio card onto a text field, such as "Website".
4. **Cover letters:** click a template, fill in Organization and Recipient, then drag the colored strip onto the cover-letter upload box. Choose **Save** to keep the filled letter as a card.
5. **Written questions:** open the **FAQ** tab, type the company once, then drag an answer onto the text box, or click it to copy and paste with Ctrl+V.
6. **Sites without drag and drop:** right-click a card and choose **Download**, then use the site's own upload button.
7. **Organize:** right-click a card to change its color or delete it. Right-click empty space in the drawer to add files.

Everything is stored only in your browser. Nothing is uploaded anywhere.

## Update

- **ZIP:** download the new ZIP and replace the folder's contents.
- **git:** run `git pull` in the folder.

Then open `chrome://extensions`, click the reload ↻ icon on CV Deck, and reload any job pages you have open. Your cards stay as long as you keep loading the extension from the same folder.

## Project structure

| File | Purpose |
|---|---|
| `manifest.json` | Manifest V3 configuration |
| `background.js` | Toolbar button, keyboard shortcut, opening the manager page and links |
| `content.js` | Drawer, card deck, popped cards and drop handling on job pages |
| `lib.js` | Storage, placeholders, FAQ data and the cover-letter PDF writer |
| `options.html` / `.css` / `.js` | Manager page: profile, cards, templates and FAQ answers |
| `preview.html` / `.js` | PDF and DOCX previews inside popped cards |
| `vendor/mammoth.browser.min.js` | DOCX-to-HTML conversion for previews |
| `PRD.md` | Product requirements document (v1.5) |

## Status

This is an early version. It has been tested on a sample application form and on Greenhouse's form markup. It has not been tested yet on LinkedIn Easy Apply, Lever, Workday or Ashby. Upload widgets differ between sites; if one does not work, use **Download** and open an issue naming the site.

## License

MIT. See [LICENSE](LICENSE). The bundled mammoth.js keeps its own license (below).

## Credits

DOCX previews use [mammoth.js](https://github.com/mwilliamson/mammoth.js) by Michael Williamson, under the BSD 2-Clause license (see `vendor/mammoth.LICENSE`).
