import {
  Course, CourseCaComponent, CourseScore, DailyPlanItem, Routine, RoutineLog,
  Expense, FinanceSettings, FinanceWeek, DailyLog, FinanceIncome,
} from "./db";
import { addDays, daysBetween, todayStr, weekStartOnOrBefore } from "./dates";

/* ---------------- Grade scale ---------------- */
export const GRADE_POINTS: Array<{ min: number; gp: number; label: string }> = [
  { min: 70, gp: 5, label: "A" },
  { min: 60, gp: 4, label: "B" },
  { min: 50, gp: 3, label: "C" },
  { min: 45, gp: 2, label: "D" },
  { min: 40, gp: 1, label: "E" },
  { min: 0, gp: 0, label: "F" },
];

export function gradeFor(percent: number) {
  return GRADE_POINTS.find((g) => percent >= g.min) ?? GRADE_POINTS[GRADE_POINTS.length - 1];
}

/* ---------------- Course standing ---------------- */

export interface ComponentStanding {
  component: CourseCaComponent;
  percentEarned: number; // contribution toward course total, out of 100
  rawPercent: number | null; // score/max * 100
  confirmed: boolean;
}

export interface CourseStanding {
  course: Course;
  components: ComponentStanding[];
  caPercentEarned: number; // confirmed CA earned, out of 100 course-wide
  caWeightCovered: number; // weight of confirmed components
  pending: CourseScore[]; // assessments mentioned but not yet scored
  currentTotal: number; // caPercentEarned (exam unknown during semester)
  gradePoint: number;
  atRisk: boolean;
}

export function computeStanding(
  course: Course,
  components: CourseCaComponent[],
  scores: CourseScore[]
): CourseStanding {
  const comps: ComponentStanding[] = components.map((c) => {
    const s = scores.find(
      (x) => x.ca_component_id === c.id && x.component === "CA" && x.status === "confirmed"
    );
    const raw = s && s.score_obtained != null && s.score_max > 0
      ? (s.score_obtained / s.score_max) * 100
      : null;
    return {
      component: c,
      rawPercent: raw,
      percentEarned: raw == null ? 0 : (raw / 100) * c.weight_percent,
      confirmed: raw != null,
    };
  });
  const caPercentEarned = comps.reduce((a, c) => a + c.percentEarned, 0);
  const caWeightCovered = comps.filter((c) => c.confirmed).reduce((a, c) => a + c.component.weight_percent, 0);
  const pending = scores.filter((x) => x.status === "pending");
  const currentTotal = caPercentEarned;
  const gp = gradeFor(currentTotal).gp;
  const onTrack = gp >= course.target_grade_point;
  // At-risk: clearly below target pace on covered weight, or lots of weight confirmed while failing.
  const pace = caWeightCovered > 0 ? (caPercentEarned / caWeightCovered) * 100 : 100;
  const atRisk = !onTrack && (caWeightCovered >= 20 || currentTotal < 35) && pace < gradeToPercent(course.target_grade_point) - 4;
  return { course, components: comps, caPercentEarned, caWeightCovered, pending, currentTotal, gradePoint: gp, atRisk };
}

export function gradeToPercent(gp: number): number {
  // Minimum percent needed for the grade point above it
  const found = GRADE_POINTS.find((g) => g.gp === gp);
  return found ? found.min : 70;
}

/* ---------------- Finance ---------------- */

export function currentFinanceWeek(fs: FinanceSettings | undefined, weeks: FinanceWeek[]): FinanceWeek | undefined {
  if (!fs) return undefined;
  const ws = weekStartOnOrBefore(todayStr(), fs.allowance_collection_day);
  return weeks.find((w) => w.week_start_date === ws);
}

export function weekBalance(week: FinanceWeek, expenses: Expense[]) {
  const spent = expenses.filter((e) => e.finance_week_id === week.id).reduce((a, e) => a + e.amount, 0);
  return {
    opening: week.opening_balance,
    spent,
    balance: week.opening_balance - spent,
  };
}

export function weekIncome(week: FinanceWeek, income: FinanceIncome[]) {
  return income.filter((entry) => entry.finance_week_id === week.id).reduce((a, entry) => a + entry.amount, 0);
}

export function daySpendClass(dayExpenses: Expense[], target: number): "overspent" | "underspent" | "on target" {
  const total = dayExpenses.reduce((a, e) => a + e.amount, 0);
  if (total > target * 1.05) return "overspent";
  if (total < target * 0.95) return "underspent";
  return "on target";
}

/* ---------------- Discipline scores ---------------- */

export function academicScore(items: DailyPlanItem[]): number | null {
  if (!items.length) return null;
  const done = items.filter((i) => i.checked).length;
  return (done / items.length) * 100;
}

export function financeScore(expensesToday: Expense[], dailyTarget: number): number | null {
  const spent = expensesToday.reduce((a, e) => a + e.amount, 0);
  if (dailyTarget <= 0) return null;
  if (spent <= dailyTarget) return 100;
  const overPct = ((spent - dailyTarget) / dailyTarget) * 100;
  return Math.max(0, 100 - overPct);
}

export function routineScore(routines: Routine[], logs: RoutineLog[], date: string): number | null {
  const today = new Date(date + "T00:00:00");
  const scheduled = routines.filter((r) => r.schedule_days.includes(today.getDay()));
  if (!scheduled.length) return null;
  const done = scheduled.filter((r) =>
    logs.some((l) => l.routine_id === r.id && l.date === date && l.status === "done")
  ).length;
  return (done / scheduled.length) * 100;
}

// NEW — Screen-time pillar. Scores the previous COMPLETE day against the
// user's daily goal: 100 at or under goal, falling linearly to 0 at 2× goal.
// null = not scored (no goal set, no stored data, or tracking just enabled) —
// the pillar is then excluded from the ring average, like the others.
// Deliberately takes yesterday's stored minutes, never today's live partial:
// a partial day would read as green all morning regardless of usage.
export function screenTimeScore(yesterdayMinutes: number | null | undefined, goalMinutes: number): number | null {
  if (goalMinutes <= 0) return null;
  if (yesterdayMinutes == null) return null;
  if (yesterdayMinutes <= goalMinutes) return 100; // 0 minutes counts — it's the goal
  return Math.max(0, Math.round(100 * (2 - yesterdayMinutes / goalMinutes)));
}

// NEW — Consecutive completed days at or under goal, ending yesterday.
// (Today is partial, so it never counts — same honesty rule.) A day with no
// stored data ends the streak rather than silently skipping it.
export function screenTimeStreak(logs: DailyLog[], goalMinutes: number): number {
  if (goalMinutes <= 0) return 0;
  const byDate = new Map<string, number | null>();
  for (const l of logs) {
    byDate.set(l.date, typeof l.screen_time_minutes === "number" ? l.screen_time_minutes : null);
  }
  let streak = 0;
  let d = addDays(todayStr(), -1);
  for (let i = 0; i < 400; i++) {
    const m = byDate.get(d);
    if (m == null || m > goalMinutes) break;
    streak++;
    d = addDays(d, -1);
  }
  return streak;
}

export function routineStreak(routine: Routine, logs: RoutineLog[]): number {
  // Count consecutive "done" days ending today/yesterday (only scheduled days count).
  const byDate = new Map<string, "done" | "skipped" | "unlogged">();
  for (const l of logs) if (l.routine_id === routine.id) byDate.set(l.date, l.status);
  let streak = 0;
  let d = todayStr();
  const sched = (s: string) => routine.schedule_days.includes(new Date(s + "T00:00:00").getDay());
  // today only counts if already done
  if (byDate.get(d) === "done" && sched(d)) { streak++; }
  d = addDays(d, -1);
  for (let i = 0; i < 400; i++) {
    if (!sched(d)) { d = addDays(d, -1); continue; }
    if (byDate.get(d) === "done") { streak++; d = addDays(d, -1); } else break;
  }
  return streak;
}

export function isSickDay(logs: DailyLog[], date: string): boolean {
  return logs.some((l) => l.date === date && l.mood_state === "sick");
}

/* ---------------- Exams ---------------- */

export function examCountdownText(daysLeft: number): string {
  if (daysLeft === 0) return "today";
  if (daysLeft === 1) return "tomorrow";
  return `in ${daysLeft} days`;
}

export function daysUntilExam(examDate: string): number {
  return daysBetween(todayStr(), examDate);
}
