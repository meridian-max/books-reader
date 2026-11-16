import { db } from "./db";
import { dateKey, type Session } from "./types";
export interface ReaderProfile {
  name: string;
  avatar: string;
  joined: number;
}
export const avatars = ["book", "sun", "moon", "sparkles", "heart", "globe"];
export async function getProfile(): Promise<ReaderProfile> {
  const saved = await db.preference<ReaderProfile>("profile");
  return {
    name: saved?.name ?? "",
    avatar: avatars.includes(saved?.avatar ?? "") ? saved!.avatar : "book",
    joined: saved?.joined ?? Date.now(),
  };
}
export async function saveProfile(value: ReaderProfile) {
  await db.savePreference("profile", {
    name: value.name.trim().slice(0, 60),
    avatar: avatars.includes(value.avatar) ? value.avatar : "book",
    joined: Number.isFinite(value.joined) ? value.joined : Date.now(),
  });
}
export function readingSummary(sessions: Session[]) {
  const daily = new Map<string, number>();
  for (const s of sessions)
    daily.set(s.date, (daily.get(s.date) ?? 0) + s.seconds);
  let streak = 0;
  const check = new Date();
  if ((daily.get(dateKey(check)) ?? 0) < 60) check.setDate(check.getDate() - 1);
  while ((daily.get(dateKey(check)) ?? 0) >= 60) {
    streak++;
    check.setDate(check.getDate() - 1);
  }
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    return {
      date: dateKey(d),
      label: d.toLocaleDateString(undefined, { weekday: "narrow" }),
      seconds: daily.get(dateKey(d)) ?? 0,
    };
  });
  return {
    today: daily.get(dateKey()) ?? 0,
    total: sessions.reduce((sum, s) => sum + s.seconds, 0),
    streak,
    week,
    days: [...daily.values()].filter((v) => v >= 60).length,
  };
}
