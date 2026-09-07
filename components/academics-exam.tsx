"use client";
import { useState } from "react";
import { db } from "@/lib/db";
import { Field, NeoButton } from "./ui";

export function ExamEditor({
  courseId,
  exam,
}: {
  courseId: number;
  exam?: { id?: number; exam_date: string; start_time: string | null; venue: string | null };
}) {
  const [date, setDate] = useState(exam?.exam_date ?? "");
  const [time, setTime] = useState(exam?.start_time ?? "");
  const [venue, setVenue] = useState(exam?.venue ?? "");
  const [saved, setSaved] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!date) return;
        const payload = {
          course_id: courseId,
          exam_date: date,
          start_time: time || null,
          venue: venue.trim() || null,
        };
        if (exam?.id) await db.exams.update(exam.id, payload);
        else await db.exams.add(payload);
        setSaved(true);
      }}
      className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end"
    >
      <Field label="Exam date" value={date} onChange={setDate} type="date" />
      <Field label="Start time" value={time} onChange={setTime} type="time" />
      <Field label="Venue" value={venue} onChange={setVenue} placeholder="Hall 2" />
      <div className="col-span-2 sm:col-span-3 flex items-center gap-3">
        <NeoButton type="submit" variant="accent" className="font-semibold">
          {exam ? "Update exam details" : "Set exam date"}
        </NeoButton>
        {saved && <span className="text-xs text-emerald-600 dark:text-emerald-300">saved — countdown and analysis are live</span>}
      </div>
    </form>
  );
}
