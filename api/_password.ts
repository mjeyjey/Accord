export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "Use at least 8 characters";
  if (!/[A-Z]/.test(pw)) return "Add at least 1 capital letter";
  if (!/[a-z]/.test(pw)) return "Add at least 1 lowercase letter";
  if (!/\d/.test(pw)) return "Add at least 1 number";
  if (!/[^A-Za-z0-9]/.test(pw)) return "Add at least 1 symbol (! @ # $ % ...)";
  return null;
}
