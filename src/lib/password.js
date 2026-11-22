export const PASSWORD_RULE =
  "At least 8 characters with 1 capital letter, 1 lowercase letter, 1 number and 1 symbol (e.g. ! @ # $).";
export function passwordProblem(pw) {
  if (pw.length < 8) return "Use at least 8 characters";
  if (!/[A-Z]/.test(pw)) return "Add at least 1 capital letter";
  if (!/[a-z]/.test(pw)) return "Add at least 1 lowercase letter";
  if (!/\d/.test(pw)) return "Add at least 1 number";
  if (!/[^A-Za-z0-9]/.test(pw)) return "Add at least 1 symbol (! @ # $ % ...)";
  return null;
}
export const passwordChecks = (pw) => [
  { ok: pw.length >= 8, label: "At least 8 characters" },
  { ok: /[A-Z]/.test(pw), label: "1 capital letter" },
  { ok: /[a-z]/.test(pw), label: "1 lowercase letter" },
  { ok: /\d/.test(pw), label: "1 number" },
  { ok: /[^A-Za-z0-9]/.test(pw), label: "1 symbol (! @ # $ % ...)" },
];
