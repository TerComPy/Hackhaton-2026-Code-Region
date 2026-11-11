import { catalog } from "./catalog";
export type Job = (typeof catalog.jobs)[number];
export const photo = (job: Job) =>
  `https://images.unsplash.com/photo-${job.photo}?auto=format&fit=crop&w=416&h=416&q=70`;
export const salary = (job: Job) =>
  job.salary
    ? job.salary.map((n) => n.toLocaleString("ru-RU")).join(" – ") + " ₽"
    : "Зарплата не указана";
