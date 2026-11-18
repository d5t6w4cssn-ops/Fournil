// Adaptation Fournil de src/js/pdf.js de Grigne : même fonction extractPdfText, mais
// avec PDF.js 3.11.174 hébergé dans vendor/pdfjs (script classique, déjà utilisé par
// Fournil), chargé seulement au premier PDF, une seule fois.
let loading = null;

function ensurePdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/pdfjs/pdf.min.js';
      s.onload = () => {
        if (!window.pdfjsLib) {
          reject(new Error('PDF.js absent'));
          return;
        }
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
        resolve(window.pdfjsLib);
      };
      s.onerror = () => {
        s.remove();
        reject(new Error('PDF.js introuvable'));
      };
      document.head.appendChild(s);
    });
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

/** Texte d'un PDF, une ligne par ligne visuelle (même découpage que Grigne). */
export async function extractPdfText(file) {
  const pdfjs = await ensurePdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf, isEvalSupported: false }).promise;
  const allLines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const lineMap = new Map();
    content.items.forEach((item) => {
      const y = Math.round(item.transform[5]);
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y).push(item);
    });
    const ys = Array.from(lineMap.keys()).sort((a, b) => b - a);
    ys.forEach((y) => {
      const line = lineMap
        .get(y)
        .sort((a, b) => a.transform[4] - b.transform[4])
        .map((i) => i.str)
        .join(' ')
        .trim();
      if (line) allLines.push(line);
    });
  }
  return allLines.join('\n');
}
