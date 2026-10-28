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

CV Deck is not on the Chrome Web Store yet. Load it as an unpacked extension:

1. Download or clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the repository folder.
4. The manager page opens. Add your name in **Profile**, then add your CVs, templates, portfolio items and FAQ answers.

## Use

1. On a job application page, click the CV Deck toolbar icon or press **Alt+Shift+D**. The drawer opens on the right.
2. **CVs / Portfolio:** drag a card onto an upload box. Links drag onto text fields.
3. **Letters:** click a template, fill in Organization and Recipient, then drag the colored strip onto the cover-letter upload box. Choose **Save** to keep the letter as a card.
4. **FAQ:** type the organization at the top, then click a question to copy its answer, or drag it onto a text box.

If you update or reload the extension, reload open job pages too.

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
