import { browser } from '$app/environment';
// Importando a URL do worker localmente via Vite
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

let pdfjs: any;

async function getPdfJS() {
  if (pdfjs) return pdfjs;
  if (browser) {
    try {
      pdfjs = await import('pdfjs-dist');

      if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        // Usar o worker local processado pelo Vite
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
      }
      return pdfjs;
    } catch (err) {
      console.error('Erro ao carregar PDF.js', err);
      throw err;
    }
  }
  return null;
}

export interface PDFBookmark {
  title: string;
  pageNumber: number;
}

export interface PDFMetadata {
  title?: string;
  pageCount: number;
  bookmarks: PDFBookmark[];
}

export class PDFService {
  static async loadDocument(file: File) {
    const pdfjs = await getPdfJS();
    if (!pdfjs) throw new Error('PDFJS não disponível no servidor (SSR)');
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
      return await loadingTask.promise;
    } catch (err) {
      console.error('Erro getDocument', err);
      // Aqui o erro 'Setting up fake worker failed' costuma acontecer se o workerSrc estiver errado
      throw new Error(`Falha ao carregar PDF: ${(err as Error).message}`);
    }
  }

  static async getMetadata(doc: any): Promise<PDFMetadata> {
    const meta = await doc.getMetadata();
    const outline = await doc.getOutline();
    
    const bookmarks: PDFBookmark[] = [];
    if (outline) {
      for (const item of outline) {
        if (item.dest) {
          try {
            const dest = typeof item.dest === 'string' ? await doc.getDestination(item.dest) : item.dest;
            if (dest) {
              const pageIndex = await doc.getPageIndex(dest[0]);
              bookmarks.push({
                title: item.title,
                pageNumber: pageIndex + 1
              });
            }
          } catch (e) {
            console.warn('Erro ao processar bookmark', e);
          }
        }
      }
    }

    return {
      title: meta.info?.Title,
      pageCount: doc.numPages,
      bookmarks
    };
  }

  static async getPageAsImage(doc: any, pageNumber: number, scale = 1.0): Promise<string> {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({
      canvasContext: context!,
      viewport
    }).promise;

    return canvas.toDataURL('image/jpeg', 0.8);
  }
}
