import { differenceInCalendarDays, format } from 'date-fns';

function parseLocalDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export const STREAK_STORAGE_KEY = 'careerAssistant_streak_v1';

export type ActivityStreak = {
  /** Current consecutive days with at least one activity */
  streak: number;
  /** Last calendar day (local) an activity was recorded, YYYY-MM-DD */
  lastDay: string | null;
  /** Distinct local calendar days in the last 7 days that had activity */
  activeDaysThisWeek: string[];
};

function todayKey(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function loadActivityStreak(): ActivityStreak {
  try {
    const raw = localStorage.getItem(STREAK_STORAGE_KEY);
    if (!raw) return { streak: 0, lastDay: null, activeDaysThisWeek: [] };
    const p = JSON.parse(raw) as Partial<ActivityStreak>;
    return {
      streak: typeof p.streak === 'number' && p.streak >= 0 ? p.streak : 0,
      lastDay: typeof p.lastDay === 'string' ? p.lastDay : null,
      activeDaysThisWeek: Array.isArray(p.activeDaysThisWeek)
        ? p.activeDaysThisWeek.filter((d): d is string => typeof d === 'string')
        : [],
    };
  } catch {
    return { streak: 0, lastDay: null, activeDaysThisWeek: [] };
  }
}

function saveActivityStreak(data: ActivityStreak): void {
  try {
    localStorage.setItem(STREAK_STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

/** Call after resume analysis, finished mock interview, or logging an application. */
export function recordActivity(): ActivityStreak {
  const today = todayKey();
  const prev = loadActivityStreak();
  const last = prev.lastDay;

  let streak = prev.streak;
  if (!last) {
    streak = 1;
  } else if (last === today) {
    /* already counted today */
  } else {
    const diff = differenceInCalendarDays(parseLocalDay(today), parseLocalDay(last));
    if (diff === 1) streak = prev.streak + 1;
    else streak = 1;
  }

  const weekSet = new Set(prev.activeDaysThisWeek);
  weekSet.add(today);
  const sorted = [...weekSet].sort();
  const cutoff = format(new Date(Date.now() - 6 * 86400000), 'yyyy-MM-dd');
  const activeDaysThisWeek = sorted.filter((d) => d >= cutoff);

  const next: ActivityStreak = {
    streak,
    lastDay: today,
    activeDaysThisWeek,
  };
  saveActivityStreak(next);
  return next;
}
