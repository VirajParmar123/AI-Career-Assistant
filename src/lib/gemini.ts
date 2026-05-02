/** Model IDs for AI Studio `generativelanguage.googleapis.com` (avoid `-latest` aliases; many 1.5 IDs return 404 now). */
const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
  'gemini-1.5-flash-8b',
  'gemini-1.5-flash',
];

const API_VERSIONS = ['v1beta', 'v1'] as const;

function getApiKey(): string {
  const key = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (!key?.trim()) {
    throw new Error('Add VITE_GEMINI_API_KEY to your .env.local file.');
  }
  return key.trim();
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/m);
  if (fence) return fence[1].trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

async function generateContent(prompt: string, jsonMode: boolean): Promise<string> {
  const key = getApiKey();
  let lastErr = '';
  for (const version of API_VERSIONS) {
    for (const model of GEMINI_MODELS) {
      const url = `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: jsonMode ? { responseMimeType: 'application/json' } : undefined,
        }),
      });
      if (!res.ok) {
        lastErr = (await res.text()) || `Gemini API error: ${res.status}`;
        continue;
      }
      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        lastErr = 'No text in Gemini response';
        continue;
      }
      return text;
    }
  }
  let friendly = lastErr || 'Gemini request failed';
  try {
    const j = JSON.parse(lastErr) as { error?: { message?: string } };
    if (j?.error?.message) friendly = j.error.message;
  } catch {
    /* keep raw */
  }
  throw new Error(friendly);
}

export type ResumeAnalysisResult = {
  score: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  tips: string[];
  matchLabel?: string;
  percentileLabel?: string;
};

export async function analyzeResumeForRole(
  resumeText: string,
  targetRole: string
): Promise<ResumeAnalysisResult> {
  const clipped = resumeText.slice(0, 14_000);
  const prompt = `You are an expert career coach. Analyze this resume for someone targeting the role: "${targetRole}".

Resume:
---
${clipped}
---

Respond with JSON only (no markdown), shape:
{
  "score": number from 0-10 (one decimal allowed),
  "summary": "2-3 sentences",
  "strengths": ["4 concise bullets"],
  "improvements": ["4 concise bullets"],
  "tips": ["4 interview prep tips for this role"],
  "matchLabel": "short badge e.g. Strong Match",
  "percentileLabel": "short e.g. Top 25%"
}`;

  const raw = await generateContent(prompt, true);
  const parsed = JSON.parse(extractJsonObject(raw)) as ResumeAnalysisResult;
  if (typeof parsed.score !== 'number' || !Array.isArray(parsed.strengths)) {
    throw new Error('Invalid analysis structure from model');
  }
  return {
    score: Math.min(10, Math.max(0, parsed.score)),
    summary: String(parsed.summary ?? ''),
    strengths: parsed.strengths.map(String).slice(0, 8),
    improvements: (parsed.improvements ?? []).map(String).slice(0, 8),
    tips: (parsed.tips ?? []).map(String).slice(0, 8),
    matchLabel: parsed.matchLabel ? String(parsed.matchLabel) : undefined,
    percentileLabel: parsed.percentileLabel ? String(parsed.percentileLabel) : undefined,
  };
}

export async function generateInterviewQuestions(
  role: string,
  type: 'behavioral' | 'technical' | 'mixed'
): Promise<string[]> {
  const prompt = `Generate exactly 5 interview questions for a "${role}" candidate.
Interview style: ${type}.
For "mixed", include both behavioral and technical questions.
Respond with JSON only: { "questions": ["q1", "q2", "q3", "q4", "q5"] }
Each question should be one clear sentence.`;

  const raw = await generateContent(prompt, true);
  const parsed = JSON.parse(extractJsonObject(raw)) as { questions?: string[] };
  const qs = (parsed.questions ?? []).map(String).filter(Boolean).slice(0, 5);
  if (qs.length < 5) throw new Error('Not enough questions from model');
  return qs;
}

export async function evaluateInterviewAnswer(
  question: string,
  answer: string,
  interviewType: string
): Promise<{ feedback: string; score: number }> {
  const prompt = `You are an interview coach. The candidate had this interview type: ${interviewType}.

Question: ${question}

Their answer:
${answer.slice(0, 8000)}

Respond with JSON only: { "feedback": "2-4 sentences of constructive feedback", "score": integer 0-100 }`;

  const raw = await generateContent(prompt, true);
  const parsed = JSON.parse(extractJsonObject(raw)) as { feedback?: string; score?: number };
  const score = typeof parsed.score === 'number' ? Math.round(parsed.score) : 70;
  return {
    feedback: String(parsed.feedback ?? 'Good effort — keep practicing with specific examples.'),
    score: Math.min(100, Math.max(0, score)),
  };
}
