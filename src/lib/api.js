import { supabase } from "./supabase";
async function call(path, method = "GET", body) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`/api/${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(json.error || res.statusText);
    error.code = json.code;
    throw error;
  }
  return json;
}
export const api = {
  get: (path) => call(path),
  list: (table) => call(`db?table=${table}`),
  create: (table, row) => call(`db?table=${table}`, "POST", row),
  update: (table, id, row) => call(`db?table=${table}&id=${id}`, "PATCH", row),
  remove: (table, id) => call(`db?table=${table}&id=${id}`, "DELETE"),
  patchMe: (row) => call("db?table=me", "PATCH", row),
  restore: (id) => call(`db?table=trash&id=${id}`, "POST"),
  emptyTrash: () => call("db?table=trash", "DELETE"),
  otp: (body) => call("otp", "POST", body),
  assistant: (messages) => call("assistant", "POST", { messages }),
  action: (action, body) => call(`schedule?action=${action}`, "POST", body),
};
export const FLOORS = ["Ground", "1st", "2nd", "3rd", "4th", "5th"];
export const floorLabel = (f) =>
  f === "Ground" ? "Ground Floor" : `${f} Floor`;
export const SLOT_TIMES = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
];
export const t5 = (t) => (t ? String(t).slice(0, 5) : "");
