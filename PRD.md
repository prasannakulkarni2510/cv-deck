# PRD — CV Deck (Chrome extension)

**Version:** 1.5
**Status:** Ready for implementation. Open questions in section 15 do not block.

**Change log**

| Version | Changes |
|---|---|
| 1.0 | First version. Bottom tray, fan deck. |
| 1.1 | Right-side drawer. Landscape stacked cards. Names always visible. Card colors. Open in new tab. |
| 1.2 | Cards pop on click. Cover-letter details and letter text change in the popped card. CV and portfolio cards pop with a preview. Open-in-new-tab button removed (link cards keep "Open link"). |
| 1.3 | Delete from the right-click menu in the drawer. Date on every card. |
| 1.4 | Download a card's file, for sites where drag and drop does not work. |
| 1.5 | FAQ tab with ready answers to common portal questions. One Organization value shared by the FAQ and cover letters. Right-click empty space in the drawer to add. |

---

## 1. Objective

The user stores CVs, cover letters and portfolio items in a Chrome extension. On any job site, the user drags a card from an animated card deck onto an application field. The extension attaches the file or inserts the link.

## 2. Problem

- Job seekers keep several versions of their CV and cover letter.
- On each application, they search folders for the correct file.
- They manually edit the cover letter for each organization and recipient.
- Job sites use different upload forms. A site-specific tool does not cover all sites.

## 3. Users / Actors

| Actor | Description |
|---|---|
| User | A job seeker who applies on several job sites in Chrome. One user per Chrome profile. |
| Job site | Any web page that has file-upload fields or text fields. |

## 4. Scope

### In Scope

- CVs (PDF/DOCX).
- Cover-letter templates (text written in the extension) and saved cover letters (PDF).
- Portfolio items (PDF/DOCX file, URL, or both).
- A right-side drawer on the job page with one deck per type.
- Drag and drop of cards onto upload fields and text fields on any site.
- A popped card for each card type, with preview and editable details.
- A cover-letter form and letter text in the popped card. The extension generates a PDF on drop.
- A profile used in the cover-letter header.
- A color for each card.
- Local storage only.

### Out of Scope

- Automatic saving of documents from job sites.
- Editing PDF or DOCX files.
- AI generation of cover letters.
- Cloud sync, accounts, backend.
- Pacos integration.
- Automatic filling of other form fields.

### Future Considerations

- Final cover-letter form fields (OQ-01).
- Side panel as a second drag source.
- Export and import of the card library.
- Pasting the filled letter text into a cover-letter text box.

## 5. Assumptions

| ID | Assumption |
|---|---|
| A-01 | The user manages cards on a manager page (Chrome options page). The drawer has a button to open it. |
| A-02 | The maximum file size is 10 MB. |
| A-03 | Placeholders use the syntax `{{field_name}}`. |
| A-04 | A saved filled letter becomes a PDF card in the Letters deck, named `Cover letter – {organization}`. |
| A-05 | The letter date is the current date in the browser locale format. |
| A-06 | The drawer reopens automatically on a site where the user left it open. |
| A-07 | IF a card name is longer than the name strip, THEN the name is cut with "…" and the full name shows on hover. |
| A-08 | The form values and the edited letter text of a template stay stored until the user changes them, also after a page reload. |
| A-09 | Until OQ-01 is closed, the form has: Organization (required), Role, Recipient (required), Recipient title. |
| A-10 | The FAQ starts with 13 questions that need a written answer, with empty answers: why this organization, why this role, what you know about the organization, about yourself, why hire you, strengths, weakness, a project you are proud of, a challenge, a difficult teammate or stakeholder, reason for leaving, five-year plan, anything else to add. Short-fact questions (salary, notice period, referral source) are not preloaded, because they are fast to type. The user can still add them (FR-087). |

## 6. Constraints

- Chrome Manifest V3.
- The deck cannot be in the toolbar popup. Chrome closes the popup when a drag leaves it.
- The extension cannot put a file into a non-standard upload widget that has no file input. ERR-002 gives the fallback.
- Chrome cannot render DOCX. DOCX previews are approximate.
- Most websites block display inside another page. Link cards show no live page preview.
- All processing is local. The extension makes no network requests.

## 7. Functional Requirements

### Library management

- **FR-001 — Add a CV.** The user can upload a PDF or DOCX file as a CV card.
- **FR-002 — Add a portfolio item.** The user can create a portfolio card that holds a file, a URL, or both.
- **FR-003 — Create a cover-letter template.** The user can write a cover-letter template as text with placeholders.
- **FR-004 — Edit a card.** The user can change the name, notes and display file name of a card.
- **FR-005 — Edit a template.** The user can change the text of a cover-letter template on the manager page.
- **FR-006 — Replace a file.** The user can replace the file of a file card. The card date changes to the replacement date (UI-014).
- **FR-007 — Delete a card.** The user can delete a card after a confirmation.
- **FR-008 — Manual entry only.** The extension creates cards only when the user adds them, or when the user selects "Save" in FR-034.
- **FR-009 — Profile.** The user can enter name, email and phone number once in the settings.

### Drawer and deck

- **FR-010 — Open the drawer.** A click on the extension icon opens or closes the drawer on the current page.
- **FR-011 — Keyboard shortcut.** A keyboard shortcut opens or closes the drawer.
- **FR-012 — Deck tabs.** The drawer has three tabs: CVs, Letters, Portfolio. Each tab shows one deck.
- **FR-013 — Stack layout.** The deck shows the cards in the stack layout of UI-003.
- **FR-014 — Hover.** Hover on a card moves the card toward the page and moves the cards below it down. The hovered card is fully visible.
- **FR-015 — Paging.** IF a deck has more than 6 cards, THEN the deck shows 6 cards and a control to show the remaining cards.

### Drag and drop

- **FR-020 — Drag a file card.** The user can drag a CV, saved letter or portfolio-file card onto an upload field.
- **FR-021 — Attach a file.** On drop, the extension attaches the file of the card to the target upload field.
- **FR-022 — Drop a URL.** The user can drag a portfolio card that has a URL onto a text field. On drop, the extension inserts the URL.
- **FR-023 — Find the target.** The extension finds the upload field nearest to the drop point. This includes hidden inputs inside upload widgets.
- **FR-024 — Highlight the target.** During the drag, the extension outlines the field that will receive the drop.
- **FR-025 — Fade during drag.** When a drag starts, the drawer and the popped card fade and let drops pass through to the page.
- **FR-026 — Embedded forms.** Drops work inside iframes.

### Cover-letter generation

- **FR-030 — Pop a template.** A click on a template card pops it into a larger card next to the drawer.
- **FR-031 — Form fields.** The popped template card shows one input for each form field (A-09, OQ-01).
- **FR-032 — Generate a PDF.** On drop, the extension fills the placeholders with the form values and generates a PDF.
- **FR-033 — Letter layout.** The PDF contains, in this order: profile header (name, email, phone), date, recipient block, letter body.
- **FR-034 — Offer to save.** After a successful drop of a template, the extension asks whether to save the filled letter as a new card.
- **FR-035 — Close the popped card.** A click on ✕ or outside the popped card returns the card to the deck. The values stay (BR-11).
- **FR-036 — Edit the letter text.** The user can edit the letter text in the popped card. The edit applies to the current application only. The template does not change.
- **FR-037 — Drag the popped card.** The user drags a popped card by its colored strip.
- **FR-038 — Live preview.** The popped template card shows a preview of the filled letter. The preview updates while the user types.

### Card colors

- **FR-040 — Automatic color.** A new card gets the next color in the palette. Adjacent cards in a deck have different colors.
- **FR-041 — Change color on the manager page.** The user can change the color of a card on the manager page.
- **FR-042 — Change color in the drawer.** The user can right-click a card in the drawer and select a color.
- **FR-044 — Add from the drawer.** A right-click on empty space in the deck area opens a menu with one action for the open tab:
  - CVs: "Add CV files…" opens the file picker. The files become CV cards (FR-001).
  - Portfolio: "Add portfolio file…" opens the file picker. The files become portfolio cards (FR-002).
  - Letters: "New template" creates a template and opens the manager page to edit its text (FR-003, FR-005).
  - FAQ: "Add question" creates a question and opens the FAQ section of the manager page (FR-087).
- **FR-043 — Delete in the drawer.** The right-click menu has "Delete card". The menu then asks for confirmation. IF the user confirms, THEN the extension deletes the card. IF the user cancels, THEN the card stays.

### Open in new tab

- **FR-050 to FR-054** — Removed in 1.2.
- **FR-055 — Open a link.** A popped card that has a URL shows an "Open link" button. The button opens the URL in a new tab.

### Download

- **FR-070 — Download.** The user can download the file of a card to the browser's download folder. The user then uploads it with the site's own upload button.
- **FR-071 — Download from the popped card.** A popped file card has a "Download" button.
- **FR-072 — Download a template.** A popped template card has a "Download" button. It downloads the filled letter PDF (FR-032, FR-033). After the download, the extension asks whether to save the letter as a new card (FR-034).
- **FR-073 — Download from the right-click menu.** The right-click menu in the drawer has "Download".
- **FR-074 — File name.** The downloaded file uses the file name shown to the job site (FR-004). A letter PDF uses `Cover_letter_{organization}.pdf`.

### FAQ answers

- **FR-080 — FAQ tab.** The drawer has a fourth tab, "FAQ". It lists the questions and a preview of each answer.
- **FR-081 — Organization field.** The FAQ tab has an Organization field at the top. It fills `{{organization}}` in questions and answers.
- **FR-082 — Shared organization.** The Organization value is shared with the Organization field of every cover-letter template (DATA-007). A change in one place shows in the other.
- **FR-083 — Filled preview.** The FAQ tab shows questions and answers with the organization filled in.
- **FR-084 — Copy.** A click on a question copies its filled answer to the clipboard.
- **FR-085 — Drag.** The user can drag a question onto a text box. On drop, the extension inserts the filled answer.
- **FR-086 — Write answers.** The manager page has an "FAQ answers" section. The user can edit each question and its answer.
- **FR-087 — Add and delete questions.** The user can add a question and delete a question (after a confirmation) on the manager page.
- **FR-088 — Upgrade of the preloaded list.** IF the user has the version-1 question list, THEN the extension removes the short-fact questions that have no answer and adds the new questions of A-10. IF a short-fact question has an answer, THEN it stays.

### Popped file and link cards

- **FR-060 — Pop a card.** A click on a CV, saved-letter or portfolio card pops it into a larger card next to the drawer.
- **FR-061 — PDF preview.** IF the card is a PDF, THEN the popped card shows all pages. The user can scroll through them.
- **FR-062 — DOCX preview.** IF the card is a DOCX, THEN the popped card shows an approximate preview with the label "Preview, may differ from Word".
- **FR-063 — Link details.** IF the card has a URL, THEN the popped card shows the URL and the page title that the user entered.
- **FR-064 — Notes and color.** The popped card shows the notes and the color palette. The user can change both.

## 8. Business Rules

- **BR-01.** IF a required form field is empty when the user starts to drag a template, THEN the drag does not start and the extension highlights the empty field.
- **BR-02.** IF the profile name is empty when the user starts to drag a template, THEN the drag does not start and the extension shows a link to the profile settings.
- **BR-03.** IF the user selects "Save" after a drop, THEN the extension creates a PDF card in the Letters deck (A-04).
- **BR-04.** IF the user selects "Don't save", THEN the extension does not store the filled letter.
- **BR-05.** IF a card with the same name exists when the extension saves, THEN the extension adds a number to the name. Example: "Cover letter – Acme (2)".
- **BR-06.** IF the target upload field accepts one file and holds a file, THEN the dropped file replaces it.
- **BR-07.** IF the target upload field accepts multiple files, THEN the extension adds the dropped file to the existing files.
- **BR-08.** IF the file type does not match the accepted types of the field, THEN the extension attaches the file and shows a warning.
- **BR-09.** IF a portfolio card has a file and a URL, THEN a drop on an upload field attaches the file, and a drop on a text field inserts the URL.
- **BR-10.** IF the drop point is on the drawer or on the popped card, THEN the drop does nothing.
- **BR-11.** The form values and the edited letter text stay until the user changes them (A-08). They do not change the template.
- **BR-12, BR-13** — Removed in 1.2.
- **BR-14.** IF a template card in the deck is dragged without being popped, THEN the extension pops the card instead of starting the drag.
- **BR-15.** IF the user drops a file-only card on a text field, THEN the extension inserts nothing and shows "Drop files on an upload box."
- **BR-16.** IF a required form field or the profile name is empty when the user downloads a template, THEN no download starts. The extension pops the card (if not popped) and highlights the missing field.
- **BR-17.** IF a card has no file (link-only card), THEN the card has no Download option.
- **BR-18.** IF a question has no answer, THEN copy and drag do nothing and the extension shows "No answer yet. Add it in settings."
- **BR-19.** IF an answer contains `{{organization}}` and the Organization field is empty, THEN copy and drag do nothing, and the extension highlights the Organization field.
- **BR-20.** IF the user drops a question on anything other than a text box, THEN the extension inserts nothing and shows "Drop answers on a text box."
- **BR-21.** IF the text box already contains text, THEN the dropped answer replaces it.

## 9. UI Requirements

- **UI-001 — Drawer position.** The drawer is fixed to the right side of the page. Width: approx. 280 px. Height: the window height.
- **UI-002 — Drawer controls.** Deck tabs with card counts, manager-page button, minimize button, close button.
- **UI-003 — Stack layout.**
  - Cards are landscape, approx. 224 × 118 px.
  - Cards stack from top to bottom with a fixed step of approx. 56 px. Each card lies on top of the card above it.
  - Each card has a small rotation (approx. 1° per position from the middle).
  - Motion uses an eased transition of approx. 0.45 s, based on the hover feel of the Framer CardDeck component.
- **UI-004 — Name strip.** The top strip (approx. 44 px) of each card shows the type badge, the card name and the card date. No other card covers this strip.
- **UI-005 — Card details.** The card body shows file name and size, or the URL.
- **UI-006 — Card color.** The name strip uses the card color as a light background with dark text. The type badge has a white background.
- **UI-007 — Palette.** 8 colors. Each color gives a text contrast ratio of 4.5:1 or more.
- **UI-008 — Popped card.** The popped card appears to the left of the drawer, approx. 420 px wide. It grows out of the deck with a short spring animation. It has the colored name strip, a close button, the content of FR-031/036/038 or FR-061–064, and a drag hint.
- **UI-009 — Target highlight.** A field that will receive a drop gets a solid outline and the label "Attach here" or "Paste here". The fallback of ERR-002 gets a dashed outline and the label "Try dropping here".
- **UI-010 — Feedback.** After each drop, the extension shows a short message on the page. The save prompt (FR-034) has "Save" and "Don't save" buttons.
- **UI-011 — Style isolation.** Page styles do not change the drawer or the popped card.
- **UI-012 — Dimming.** The page behind is dimmed while a card is popped. The dimming is removed during a drag.
- **UI-014 — Card date.** The card date is the date the content was added or last replaced (FR-006). Format: day and short month, for example "29 Oct". IF the year is not the current year, THEN the date includes the year, for example "12 Mar 25". Hover shows the full date.
- **UI-013 — Required fields.** The popped template card shows "Ready" when all required fields have values. Otherwise it shows "Fill required fields".

## 10. Data Requirements

- **DATA-001 — Card.** ID, deck (CV, letter, portfolio), name, color, notes, creation date, replacement date, last-used date.
- **DATA-002 — File card.** File name, file type, size, file content.
- **DATA-003 — Template card.** Template text with placeholders. Current form values. Current edited letter text (empty = template text).
- **DATA-004 — Portfolio card.** A file (DATA-002), a URL with page title, or both.
- **DATA-005 — Profile.** Name, email, phone. Other fields TBD (OQ-02).
- **DATA-007 — Current organization.** One organization value for the current application. Used by the FAQ (FR-081) and by all cover-letter templates. It stays until the user changes it.
- **DATA-008 — FAQ item.** ID, question, answer. The list order is the display order.
- **DATA-006 — Storage.** All data is stored locally in the Chrome profile with the unlimited-storage permission.

## 11. Error Handling

- **ERR-001 — Card missing.** IF a dropped card does not exist, THEN the extension shows "That card no longer exists."
- **ERR-002 — No upload field.** IF the extension finds no upload field near the drop point, THEN it simulates a file drop on the element at that point and shows a warning to use the upload button of the site.
- **ERR-003 — File too large.** IF the user uploads a file larger than 10 MB, THEN the extension rejects it and shows the limit.
- **ERR-004 — Wrong file type.** IF the user uploads a file that is not PDF or DOCX, THEN the extension rejects it.
- **ERR-005 — PDF generation failed.** IF the extension cannot generate the PDF, THEN it attaches nothing and shows an error message.
- **ERR-006 — Unsupported page.** IF the page is a Chrome internal page, THEN the drawer does not open.
- **ERR-007 — Link on upload field.** IF the user drops a link-only card on an upload field, THEN the extension attaches nothing and shows "Drop links on a text field."
- **ERR-008 — Preview failed.** IF the extension cannot render a preview, THEN the popped card shows "Preview not available" and the card stays usable.

## 12. Non-Functional Requirements

- **NFR-001.** The drawer opens in less than 300 ms after the click on the icon.
- **NFR-002.** Hover and pop animations run at 60 fps with 6 visible cards.
- **NFR-003.** Reference test sites: Greenhouse, Lever, Workday, LinkedIn Easy Apply, Ashby.
- **SEC-001.** The extension sends no data outside the browser.
- **SEC-002.** The extension changes the page only at the drop target and in its own drawer and popped card.

## 13. Dependencies

- Chrome Manifest V3 APIs: storage, scripting, content scripts.
- A client-side PDF generator for cover letters.
- A client-side DOCX-to-HTML converter for DOCX previews.

## 14. Acceptance Criteria

| Req | Given / When / Then |
|---|---|
| FR-001 | Given the manager page, when the user uploads `CV.pdf`, then a card named "CV" appears in the CVs deck. |
| FR-010 | Given a job page, when the user clicks the extension icon, then the drawer appears on the right side. |
| UI-004 | Given a deck of 6 cards and no hover, then the name of every card is visible. |
| FR-014 | Given a deck of 6 cards, when the user hovers over card 3, then card 3 is fully visible and cards 4–6 move down. |
| FR-015 | Given 9 CV cards, when the user opens the CVs tab, then 6 cards show and a control shows "3 more". |
| FR-021 | Given a page with one resume upload field, when the user drops a CV card on it, then the field contains the file. |
| FR-023 | Given separate Resume and Cover letter upload widgets, when the user drops a CV card on the Resume widget, then only the Resume field receives the file. |
| FR-025 | Given an upload field behind the drawer, when the user starts a drag, then the drawer fades and the field can receive the drop. |
| FR-026 | Given a form inside an iframe, when the user drops a CV card on its upload field, then the field receives the file. |
| FR-030 | Given the Letters tab, when the user clicks a template card, then a popped card with the form and the preview appears and the page is dimmed. |
| FR-036 | Given a popped template, when the user changes the letter text and drops the card, then the PDF contains the changed text and the template text on the manager page is unchanged. |
| FR-038 | Given a popped template, when the user types "Acme" in Organization, then the preview shows "Acme" in place of `{{organization}}`. |
| BR-01 | Given a popped template with an empty Recipient, when the user starts to drag the strip, then no drag starts and Recipient is highlighted. |
| BR-14 | Given a template card in the deck, when the user drags it, then the card pops and no drag starts. |
| FR-032 / FR-033 | Given organization "Acme" and a complete profile, when the user drops the popped template on an upload field, then the field receives a PDF with the profile header and "Acme" in the body. |
| BR-03 | Given a successful template drop, when the user selects "Save", then a card "Cover letter – Acme" appears in the Letters deck. |
| BR-04 | Given a successful template drop, when the user selects "Don't save", then the number of cards does not change. |
| FR-035 | Given a popped template with values, when the user closes and reopens it, then the values are unchanged. |
| FR-061 | Given a 3-page PDF card, when the user clicks it, then the popped card shows all 3 pages in a scrollable area. |
| FR-062 | Given a DOCX card, when the user clicks it, then the popped card shows a preview and the label "Preview, may differ from Word". |
| FR-055 | Given a popped link card, when the user clicks "Open link", then the URL opens in a new tab. |
| BR-09 | Given a portfolio card with a file and a URL, when the user drops it on a text field, then the field contains the URL. |
| FR-040 | Given an empty CVs deck, when the user adds 3 CVs, then the 3 cards have 3 different colors. |
| FR-042 | Given a card in the drawer, when the user right-clicks it and selects a color, then the name strip shows that color in the drawer and on the manager page. |
| FR-043 | Given a card in the drawer, when the user right-clicks it, selects "Delete card" and confirms, then the card disappears from the drawer and the manager page. |
| FR-043 | Given the delete confirmation, when the user selects "Cancel", then the card stays. |
| UI-014 | Given a CV added on 29 October of the current year, then its name strip shows "29 Oct". |
| UI-014 | Given a CV whose file is replaced today, then its name strip shows today's date. |
| FR-071 / FR-074 | Given a popped CV card with the file name `Prasanna_CV.pdf`, when the user clicks "Download", then the browser downloads `Prasanna_CV.pdf`. |
| FR-072 | Given a popped template with organization "Acme" and recipient filled, when the user clicks "Download", then the browser downloads `Cover_letter_Acme.pdf` and the save prompt appears. |
| BR-16 | Given a template with an empty Recipient, when the user selects "Download" in the right-click menu, then no download starts, the card pops and Recipient is highlighted. |
| BR-17 | Given a link-only card, when the user right-clicks it, then the menu has no "Download". |
| FR-044 | Given the CVs tab, when the user right-clicks empty space and selects "Add CV files…" and picks `CV.pdf`, then a card "CV" appears in the CVs deck. |
| FR-084 | Given the answer "I admire {{organization}}." and Organization "Acme", when the user clicks the question, then the clipboard contains "I admire Acme." |
| FR-085 | Given a text box on the page, when the user drags a question onto it, then the text box contains the filled answer. |
| FR-082 | Given Organization "Acme" in the FAQ tab, when the user pops a cover-letter template, then its Organization field shows "Acme". |
| BR-18 | Given a question with no answer, when the user clicks it, then nothing is copied and "No answer yet. Add it in settings." appears. |
| BR-19 | Given an answer with `{{organization}}` and an empty Organization, when the user clicks the question, then nothing is copied and the Organization field is highlighted. |
| FR-087 | Given the manager page, when the user clicks "Add question", then a new question appears in the FAQ section and in the FAQ tab. |
| ERR-002 | Given a page with no file input near the drop point, when the user drops a CV card, then a warning appears. |
| ERR-007 | Given a link-only card, when the user drops it on an upload field, then no file is attached and "Drop links on a text field." appears. |

## 15. Open Questions

| ID | Question |
|---|---|
| OQ-01 | Final cover-letter form fields and which are required. A-09 applies until closed. |
| OQ-02 | Profile fields besides name, email, phone (for example address, LinkedIn). |
| OQ-03 | PDF font and page size. Default: A4, Helvetica. |
