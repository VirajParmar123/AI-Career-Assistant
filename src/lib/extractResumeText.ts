import mammoth from 'mammoth';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

/** Matches UI limit — kept in one place for validation + extraction. */
export const MAX_RESUME_BYTES = 10 * 1024 * 1024;

let pdfWorkerConfigured = false;

function ensurePdfWorker(): void {
  if (!pdfWorkerConfigured) {
    GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    pdfWorkerConfigured = true;
  }
}

function readFileAsUtf8(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

/** Rough signal that decoded bytes are not useful resume plain text. */
function looksLikeBinaryText(s: string): boolean {
  if (s.includes('\u0000')) return true;
  const sample = s.slice(0, 12000);
  if (!sample.length) return false;
  let suspicious = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i);
    if (c < 9 || (c > 13 && c < 32 && c !== 27)) suspicious++;
  }
  return suspicious / sample.length > 0.03;
}

async function extractPdfText(file: File): Promise<string> {
  ensurePdfWorker();
  const raw = await file.arrayBuffer();
  const data = new Uint8Array(raw);
  const pdf = await getDocument({ data }).promise;
  const chunks: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (item && typeof item === 'object' && 'str' in item && typeof (item as { str: unknown }).str === 'string') {
        chunks.push((item as { str: string }).str);
      }
    }
    chunks.push('\n');
  }
  const text = chunks.join(' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) {
    throw new Error(
      'No extractable text in this PDF (it may be image-only). Paste your resume text or use a text-based PDF.'
    );
  }
  return text;
}

async function extractDocxText(file: File): Promise<string> {
  const ab = await file.arrayBuffer();
  const { value } = await mammoth.extractRawText({ arrayBuffer: ab });
  const text = value.replace(/\r\n/g, '\n').trim();
  if (!text) {
    throw new Error('No text found in this Word document.');
  }
  return text;
}

/**
 * Reads resume content as plain text for the AI analyzer.
 * Supports PDF, DOCX, plain text and many text-based formats; tries a best-effort read for others.
 */
export async function extractResumeText(file: File): Promise<string> {
  if (file.size > MAX_RESUME_BYTES) {
    throw new Error('File must be 10MB or smaller.');
  }

  const name = file.name.toLowerCase();
  const mime = file.type.toLowerCase();

  if (mime === 'application/pdf' || name.endsWith('.pdf')) {
    return extractPdfText(file);
  }

  if (
    name.endsWith('.docx') ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return extractDocxText(file);
  }

  if (name.endsWith('.doc') && !name.endsWith('.docx')) {
    throw new Error('Legacy .doc is not supported in the browser. Save as PDF or DOCX and upload again.');
  }

  const textMimeHints =
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/rtf' ||
    mime === 'application/xhtml+xml';

  const textExtHints =
    name.endsWith('.txt') ||
    name.endsWith('.md') ||
    name.endsWith('.csv') ||
    name.endsWith('.json') ||
    name.endsWith('.html') ||
    name.endsWith('.htm') ||
    name.endsWith('.rtf') ||
    name.endsWith('.xml');

  const tryUtf8 = async (): Promise<string> => {
    const text = (await readFileAsUtf8(file)).replace(/\u0000/g, '').trim();
    return text;
  };

  if (textMimeHints || textExtHints) {
    const text = await tryUtf8();
    if (!text) throw new Error('This file appears empty.');
    if (looksLikeBinaryText(text)) {
      throw new Error('Could not read usable text from this file. Try PDF, DOCX, or paste your resume.');
    }
    return text;
  }

  const fallback = await tryUtf8();
  if (!fallback) throw new Error('This file appears empty.');
  if (looksLikeBinaryText(fallback)) {
    throw new Error(
      'This file type is not readable as text here. Use PDF, DOCX, a plain-text export, or paste your resume.'
    );
  }
  return fallback;
}
