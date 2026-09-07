"use client";
import { db, Course } from "./db";
import { addDays, todayStr, toStr, fromStr, weekStartOnOrBefore } from "./dates";

/**
 * Loads a few realistic weeks of sample data so the app feels alive immediately:
 * courses with topics, daily plans/logs/chat, allowance cycles with spending,
 * routine streaks, and one weekly digest. Fully clearable afterwards.
 */

const COURSES: Array<{ code: string; title: string; units: number; type: "general" | "departmental" }> = [
  { code: "CSC141", title: "Computer Programming I", units: 3, type: "departmental" },
  { code: "MTH102", title: "General Mathematics II", units: 3, type: "general" },
  { code: "PHY103", title: "General Physics I", units: 2, type: "general" },
  { code: "GST105", title: "Use of English", units: 2, type: "general" },
];

const TOPICS: Record<string, string[]> = {
  CSC141: ["Variables & Types", "Conditionals", "Loops", "Functions", "Arrays", "Recursion", "File I/O"],
  MTH102: ["Sets & Logic", "Quadratic Equations", "Indices & Logarithms", "Sequences", "Trigonometry 1", "Trigonometry 2"],
  PHY103: ["Measurement", "Kinematics", "Newton's Laws", "Momentum", "Work & Energy"],
  GST105: ["Summary Writing", "Concord", "Comprehension", "Report Writing"],
};

const TOPIC_STATES: Array<"untouched" | "reading" | "read" | "revising"> = ["read", "read", "revising", "reading", "untouched", "untouched", "untouched"];

const PLAN_POOL = ["CSC141 — 2hrs", "MTH102 problem set", "PHY103 reading", "Gym", "Bible reading", "GST105 summary", "CSC141 coding practice"];
const MOODS = ["good", "okay", "rough"];

export async function loadSampleData() {
  // Guard: only seed if there is no live semester yet.
  const profile = (await db.profile.toArray())[0];
  if (!profile) return false;
  const existing = await db.courses.count();
  if (existing > 0) return false;

  const today = todayStr();
  const start = addDays(today, -28);
  const end = addDays(start, 120);

  // Courses + CA components + exam dates
  const courseIds: number[] = [];
  for (const c of COURSES) {
    const id = await db.courses.add({
      code: c.code, title: c.title, credit_units: c.units, course_type: c.type,
      ca_weight_percent: 30, exam_weight_percent: 70, target_grade_point: 4,
    });
    courseIds.push(id);
    if (c.type === "general") {
      await db.course_ca_components.add({ course_id: id, label: "CA", weight_percent: 30 });
    } else {
      await db.course_ca_components.add({ course_id: id, label: "Test 1", weight_percent: 15 });
      await db.course_ca_components.add({ course_id: id, label: "Test 2", weight_percent: 15 });
    }
    // Topics in varying states
    const list = TOPICS[c.code] ?? [];
    for (let i = 0; i < list.length; i++) {
      await db.course_topics.add({ course_id: id, name: list[i], status: TOPIC_STATES[i % TOPIC_STATES.length] });
    }
  }
  await db.exams.add({ course_id: courseIds[0], exam_date: addDays(today, 3), start_time: "09:00", venue: "Hall 2" });
  await db.exams.add({ course_id: courseIds[1], exam_date: addDays(today, 10), start_time: "13:00", venue: "LT1" });

  // Class timetable (Mon-Fri spread)
  const tt = [
    [courseIds[0], 1, "08:00", "10:00", "LT1"],
    [courseIds[1], 1, "14:00", "16:00", "LT3"],
    [courseIds[2], 2, "10:00", "12:00", "Phy Lab"],
    [courseIds[3], 3, "08:00", "10:00", "Hall B"],
    [courseIds[0], 4, "08:00", "10:00", "LT1"],
    [courseIds[1], 5, "12:00", "14:00", "LT3"],
  ] as Array<[number, number, string, string, string]>;
  for (const [cid, day, st, et, venue] of tt) {
    await db.timetable_slots.add({ course_id: cid, day_of_week: day, start_time: st, end_time: et, venue });
  }

  // Finance settings + three completed-ish cycles
  const collectionDay = 0; // Sunday
  await db.finance_settings.add({
    allowance_collection_day: collectionDay,
    current_allowance_amount: 10000,
    daily_spending_target: 1200,
    weekly_savings_target: 2000,
  });
  const spendingShapes = [
    [900, 1100, 1400, 1000, 1600, 1200, 900], // week -3: disciplined
    [1500, 1800, 1200, 2200, 1300, 1900, 1600], // week -2: leaky
    [1000, 1200, 1100, 1300, 1400, 1000, 1100], // last week: steady
  ];
  for (let w = 0; w < 3; w++) {
    const ws = weekStartOnOrBefore(addDays(today, -7 * (3 - w)), collectionDay);
    const rollover = w === 0 ? 0 : Math.max(0, 10000 - spendingShapes[w - 1].reduce((a, b) => a + b, 0));
    const wid = await db.finance_weeks.add({
      week_start_date: ws,
      allowance_collected: 10000,
      rollover_from_previous: rollover,
      opening_balance: 10000 + rollover,
      closed: 1,
    });
    for (let d = 0; d < 7; d++) {
      const date = addDays(ws, d);
      if (date >= today) break;
      const amount = spendingShapes[w][d];
      await db.expenses.add({
        finance_week_id: wid, date, amount,
        tag: amount > 1400 ? "want" : "need",
        note: amount > 1400 ? (d % 2 ? "shuttle & snacks" : "impulse buy") : "food & essentials",
      });
    }
  }
  // Current open week
  const currentWs = weekStartOnOrBefore(today, collectionDay);
  await db.finance_weeks.add({
    week_start_date: currentWs,
    allowance_collected: 10000,
    rollover_from_previous: 1200,
    opening_balance: 11200,
    closed: 0,
  }).then(async (wid) => {
    for (let d = 0; d < (fromStr(today).getDay() || 1); d++) {
      const date = addDays(currentWs, d);
      if (date >= today) break;
      await db.expenses.add({ finance_week_id: wid, date, amount: 1000 + (d % 3) * 250, tag: d % 2 ? "need" : "want", note: d % 2 ? "food" : "campus errands" });
    }
  });

  // Routines + logs with a streak
  const routineIds: number[] = [];
  routineIds.push(await db.routines.add({ name: "Devotional", schedule_type: "daily", schedule_days: [0, 1, 2, 3, 4, 5, 6], reminder_time: "06:00" }));
  routineIds.push(await db.routines.add({ name: "Gym", schedule_type: "specific_days", schedule_days: [1, 3, 5], reminder_time: "17:30" }));
  routineIds.push(await db.routines.add({ name: "Night review", schedule_type: "specific_days", schedule_days: [1, 2, 3, 4], reminder_time: "21:00" }));
  for (let i = 0; i < 12; i++) {
    const date = addDays(today, -i);
    for (let ri = 0; ri < routineIds.length; ri++) {
      const r = (await db.routines.get(routineIds[ri]))!;
      if (!r.schedule_days.includes(fromStr(date).getDay())) continue;
      const roll = (i + ri) % 7;
      const status = roll < 5 ? "done" : roll === 5 ? "skipped" : "unlogged";
      await db.routine_logs.add({ routine_id: routineIds[ri], date, status: status as "done" | "skipped" | "unlogged" });
    }
  }

  // Daily plans, logs, chat, discipline scores for the last 3 weeks
  for (let i = 24; i >= 0; i--) {
    const date = addDays(today, -i);
    const dow = fromStr(date).getDay();
    if (dow === 0) continue; // Sundays quiet
    const nItems = 2 + (i % 3);
    for (let j = 0; j < nItems; j++) {
      const checked = ((i * 3 + j) % 4 !== 0 ? 1 : 0) as 0 | 1;
      await db.daily_plan_items.add({ date, text: PLAN_POOL[(i + j) % PLAN_POOL.length], checked, carried_from_date: null });
    }
    const mood = MOODS[i % 3];
    await db.daily_logs.add({
      date,
      evening_reflection_text: i % 4 === 0 ? "" : `Kept at it today. ${mood === "good" ? "Momentum is real." : mood === "okay" ? "Steady, nothing dramatic." : "Tough one, but showed up."}`,
      mood_state: mood,
      parsed_study_hours: 1 + (i % 4),
      parsed_summary: "logged from sample history",
    });
    if (i % 4 !== 0) {
      await db.chat_messages.add({ date, sender: "user", text: "Did the reading and hit the gym.", timestamp: new Date(date + "T20:30:00").getTime() });
      await db.chat_messages.add({ date, sender: "reso", text: "That's the pattern that compounds. Keep the streak breathing.", timestamp: new Date(date + "T20:31:00").getTime() });
    }
    const acad = ((i * 3) % 40) + 55;
    const finScore = 100 - ((i % 3) * 9);
    const rScore = ((i * 7) % 35) + 60;
    await db.discipline_scores.add({
      date,
      academic_score: acad,
      finance_score: finScore,
      routine_score: rScore,
      overall_score: (acad + finScore + rScore) / 3,
    });
  }

  // One weekly digest
  await db.weekly_digests.add({
    week_start_date: weekStartOnOrBefore(addDays(today, -7), 1),
    digest_text:
      "Your GPA pace held steady this week — the plan-completion rate climbed from 61% to 74%, and that is the number doing the quiet work.\nYour biggest want-leak was shuttle and snacks again; it took the same shape as last week, which is worth one honest look before the next cycle opens.\nDevotional is your steadiest streak — twelve days without a break, and it shows in the mornings.\nCSC141 is running closest to the edge of your courses; the topics you have marked untouched are the ones the exam usually touches.\nOne thought: what would tomorrow look like if the first hour went to the hardest thing?",
    created_at: Date.now() - 3 * 86400000,
  });

  await db.meta.put({ key: "sample_data", value: "1" });
  return true;
}

/** Removes everything the sample loader created and returns to a clean slate. */
export async function clearSampleData() {
  await Promise.all([
    db.courses.clear(), db.course_ca_components.clear(), db.course_scores.clear(),
    db.course_topics.clear(), db.timetable_slots.clear(), db.exams.clear(),
    db.personal_study_slots.clear(), db.finance_weeks.clear(), db.expenses.clear(),
    db.routines.clear(), db.routine_logs.clear(), db.daily_plan_items.clear(),
    db.daily_logs.clear(), db.chat_messages.clear(), db.discipline_scores.clear(),
    db.weekly_digests.clear(),
  ]);
  await db.meta.delete("sample_data");
}
