"use client";
import Dexie, { Table } from "dexie";

export type CourseType = "general" | "departmental";
export type TopicStatus = "untouched" | "reading" | "read" | "revising";
export type ScoreComponent = "CA" | "Exam";
export type Rank = "important" | "medium" | "low";

export interface Profile {
  id?: number;
  name: string;
  age: number;
  university: string;
  gpa_target: number;
  semester_start_date: string; // yyyy-mm-dd
  semester_end_date: string;
  onboarding_complete: 0 | 1;
  theme_preference: "light" | "dark" | "system";
  new_semester_mode?: 0 | 1; // 1 = onboarding running to start a fresh semester (skip profile step)
}

export interface Course {
  id?: number;
  code: string;
  title: string;
  credit_units: number;
  course_type: CourseType;
  ca_weight_percent: number; // total CA weight
  exam_weight_percent: number;
  target_grade_point: number; // 0-5
}

export interface CourseCaComponent {
  id?: number;
  course_id: number;
  label: string; // "CA" for general; "Test 1" / "Test 2" for departmental
  weight_percent: number;
}

export interface CourseScore {
  id?: number;
  course_id: number;
  ca_component_id: number | null;
  label: string;
  score_obtained: number | null;
  score_max: number;
  component: ScoreComponent;
  date_recorded: string;
  was_impromptu: 0 | 1;
  status: "pending" | "confirmed";
}

export interface CourseTopic {
  id?: number;
  course_id: number;
  name: string;
  status: TopicStatus;
}

/** One-time migration: old 3-state topic values map onto the 4-state cycle. */
export async function migrateTopicStatuses() {
  const all = await db.course_topics.toArray();
  for (const t of all) {
    if ((t.status as string) === "not_touched") await db.course_topics.update(t.id!, { status: "untouched" });
    else if ((t.status as string) === "completed") await db.course_topics.update(t.id!, { status: "read" });
  }
}

export interface TimetableSlot {
  id?: number;
  course_id: number;
  day_of_week: number; // 0=Sun .. 6=Sat
  start_time: string; // HH:mm
  end_time: string;
  venue: string;
}

export interface Exam {
  id?: number;
  course_id: number;
  exam_date: string; // yyyy-mm-dd
  start_time: string | null;
  venue: string | null;
}

export interface PersonalStudySlot {
  id?: number;
  day_of_week: number | null;
  specific_date: string | null;
  start_time: string;
  end_time: string;
  note: string;
}

export interface FinanceSettings {
  id?: number;
  allowance_collection_day: number; // 0=Sun .. 6=Sat
  current_allowance_amount: number;
  daily_spending_target: number;
  weekly_savings_target: number;
}

export interface FinanceWeek {
  id?: number;
  week_start_date: string;
  allowance_collected: number;
  rollover_from_previous: number;
  opening_balance: number;
  closed: 0 | 1;
}

export interface Expense {
  id?: number;
  finance_week_id: number;
  date: string;
  amount: number;
  tag: "want" | "need";
  note: string;
}

export interface FinanceIncome {
  id?: number;
  finance_week_id: number;
  date: string;
  amount: number;
  note: string;
}

export interface Routine {
  id?: number;
  name: string;
  schedule_type: "daily" | "specific_days";
  schedule_days: number[]; // day_of_week list; all 7 for daily
  reminder_time: string; // HH:mm
}

export interface RoutineLog {
  id?: number;
  routine_id: number;
  date: string;
  status: "done" | "skipped" | "unlogged";
}

export interface DailyPlanItem {
  id?: number;
  date: string;
  text: string;
  checked: 0 | 1;
  carried_from_date: string | null;
}

export interface DailyLog {
  id?: number;
  date: string;
  evening_reflection_text: string;
  mood_state: string; // includes "sick"
  parsed_study_hours: number | null;
  parsed_summary: string;
  /** Previous day's total screen time in minutes, from Android UsageStats via the Capacitor bridge. Optional — absent when unavailable. */
  screen_time_minutes?: number | null;
  /** The app that took the most of that time, when the device reports it. */
  screen_time_top_app?: string | null;
  /** Per-app breakdown (top N, with base64 icons), stored by the same pull. Absent on rows from before this field existed. */
  screen_time_apps?: { package: string; app_name: string; minutes: number; icon: string | null }[] | null;
}

/** Single-row settings table: whether screen time tracking is turned on. */
export interface ScreentimeTracking {
  id?: number; // always 0 — single settings row
  enabled: 0 | 1;
}

export interface ChatMessage {
  id?: number;
  date: string;
  sender: "user" | "reso";
  text: string;
  timestamp: number;
}

export interface DisciplineScore {
  id?: number;
  date: string;
  academic_score: number | null;
  finance_score: number | null;
  routine_score: number | null;
  overall_score: number | null;
}

export interface WeeklyDigest {
  id?: number;
  week_start_date: string;
  digest_text: string;
  created_at: number;
}

export interface EmailAccount {
  id?: number;
  provider: "gmail";
  email: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: number;
  last_fetched_at: number | null;
}

export interface EmailItem {
  id?: number;
  email_account_id: number;
  subject: string;
  sender: string;
  snippet: string;
  summary: string;
  rank: Rank;
  fetched_date: string;
}

export interface ArchivedSemester {
  id?: number;
  label: string;
  archived_at: number;
  payload: string; // full JSON export of the semester's data
}

export interface Meta {
  key: string;
  value: string;
}

/** Per-reminder preference: enable/disable and optional time override. */
export interface ReminderPref {
  key: string;          // "spend9pm" | "cycle9pm" | "exam" | "class" | "routine:{id}"
  enabled: 0 | 1;
  time: string | null;  // HH:mm override; null keeps the default
}

/** A user-created reminder that fires every day at its time. */
export interface CustomReminder {
  id?: number;
  label: string;
  time: string;         // HH:mm
  enabled: 0 | 1;
}

/** A named alarm that RINGS (sound + vibration, snooze/stop) at its time, daily. */
export interface Alarm {
  id?: number;
  label: string;
  time: string;         // HH:mm
  enabled: 0 | 1;
}

/** Course-scoped advice chat ("ask about my tests in this course"). */
export interface CourseChat {
  id?: number;
  course_id: number;
  sender: "user" | "reso";
  text: string;
  ts: number;
}

class ResoDB extends Dexie {
  profile!: Table<Profile, number>;
  courses!: Table<Course, number>;
  course_ca_components!: Table<CourseCaComponent, number>;
  course_scores!: Table<CourseScore, number>;
  course_topics!: Table<CourseTopic, number>;
  timetable_slots!: Table<TimetableSlot, number>;
  exams!: Table<Exam, number>;
  personal_study_slots!: Table<PersonalStudySlot, number>;
  finance_settings!: Table<FinanceSettings, number>;
  finance_weeks!: Table<FinanceWeek, number>;
  expenses!: Table<Expense, number>;
  finance_income!: Table<FinanceIncome, number>;
  routines!: Table<Routine, number>;
  routine_logs!: Table<RoutineLog, number>;
  daily_plan_items!: Table<DailyPlanItem, number>;
  daily_logs!: Table<DailyLog, number>;
  screentime_tracking!: Table<ScreentimeTracking, number>;
  chat_messages!: Table<ChatMessage, number>;
  discipline_scores!: Table<DisciplineScore, number>;
  weekly_digests!: Table<WeeklyDigest, number>;
  email_accounts!: Table<EmailAccount, number>;
  email_items!: Table<EmailItem, number>;
  archived_semesters!: Table<ArchivedSemester, number>;
  meta!: Table<Meta, string>;
  reminder_prefs!: Table<ReminderPref, string>;
  custom_reminders!: Table<CustomReminder, number>;
  alarms!: Table<Alarm, number>;
  course_chats!: Table<CourseChat, number>;

  constructor() {
    super("reso-db");
    this.version(1).stores({
      profile: "++id",
      courses: "++id, code",
      course_ca_components: "++id, course_id",
      course_scores: "++id, course_id, ca_component_id, component, status",
      course_topics: "++id, course_id, status",
      timetable_slots: "++id, course_id, day_of_week",
      exams: "++id, course_id, exam_date",
      personal_study_slots: "++id, day_of_week",
      finance_settings: "++id",
      finance_weeks: "++id, week_start_date",
      expenses: "++id, finance_week_id, date, tag",
      finance_income: "++id, finance_week_id, date",
      routines: "++id",
      routine_logs: "++id, routine_id, date",
      daily_plan_items: "++id, date, checked",
      daily_logs: "++id, date, screen_time_minutes, screen_time_top_app",
      screentime_tracking: "++id",
      chat_messages: "++id, date, timestamp",
      discipline_scores: "++id, date",
      weekly_digests: "++id, week_start_date",
      email_accounts: "++id, email",
      email_items: "++id, email_account_id, fetched_date, rank",
      archived_semesters: "++id, archived_at",
      meta: "key",
    });
    this.version(2).stores({
      reminder_prefs: "key",
      custom_reminders: "++id",
    });
    this.version(3).stores({
      alarms: "++id, time",
    });
    this.version(4).stores({
      course_chats: "++id, course_id, ts",
    });
    this.version(5).stores({
      finance_income: "++id, finance_week_id, date",
    });
  }
}

export const db = new ResoDB();

export async function getMeta(key: string): Promise<string | null> {
  const row = await db.meta.get(key);
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string) {
  await db.meta.put({ key, value });
}

/** Get the screen time tracking enabled state (default: OFF). */
export async function getScreenTimeEnabled(): Promise<0 | 1> {
  const row = await db.screentime_tracking.get(0); // single row, id=0
  return row?.enabled ?? 0;
}

/** Set the screen time tracking enabled state. */
export async function setScreenTimeEnabled(enabled: 0 | 1) {
  await db.screentime_tracking.put({ id: 0, enabled });
}

export async function getProfile(): Promise<Profile | undefined> {
  const rows = await db.profile.toArray();
  return rows[0];
}

export async function exportAllData(): Promise<string> {
  const dump: Record<string, unknown> = {};
  const tables = [
    "profile", "courses", "course_ca_components", "course_scores",
    "course_topics", "timetable_slots", "exams", "personal_study_slots",
    "finance_settings", "finance_weeks", "expenses", "finance_income", "routines",
    "routine_logs", "daily_plan_items", "daily_logs", "chat_messages",
    "discipline_scores", "weekly_digests", "email_accounts", "email_items",
    "archived_semesters", "screentime_tracking", "reminder_prefs",
    "custom_reminders", "alarms", "course_chats",
  ];
  for (const t of tables) {
    dump[t] = await (db as unknown as Record<string, Table>)[t].toArray();
  }
  return JSON.stringify({ app: "reso", exported_at: new Date().toISOString(), data: dump }, null, 2);
}
