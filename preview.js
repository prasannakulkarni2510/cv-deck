// Rendered inside the popped card (FR-061, FR-062). Runs on the extension
// origin, so Chrome's own PDF viewer can show every page with scrolling.
(async () => {
  const fail = () => { document.body.innerHTML = '<div class="msg">Preview not available</div>'; }; // ERR-008
  try {
    const id = new URLSearchParams(location.search).get('id');
    const card = (await CVDeck.list()).find((c) => c.id === id);
    const data = card && (await CVDeck.getData(id));
    if (!data) return fail();
    const bytes = CVDeck.dataUrlToBytes(data);

    if (card.mime === 'application/pdf') {
      const frame = document.createElement('iframe');
      frame.id = 'pdf';
      frame.src = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })) + '#toolbar=0&navpanes=0&view=FitH';
      document.body.appendChild(frame);
    } else {
      const { value } = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer });
      const doc = document.createElement('div');
      doc.id = 'docx';
      doc.innerHTML = value;
      doc.querySelectorAll('script, iframe, object, embed').forEach((n) => n.remove());
      document.body.appendChild(doc);
    }
  } catch {
    fail();
  }
})();
