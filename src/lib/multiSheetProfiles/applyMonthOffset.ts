export const applyMonthOffset = (reportMonth: string, offset: number): string => {
  if (!reportMonth || !offset) return reportMonth;
  const [year, month] = reportMonth.split("-").map(Number);
  if (!year || !month) return reportMonth;
  const date = new Date(year, month - 1 + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};