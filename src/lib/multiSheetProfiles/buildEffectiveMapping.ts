export function buildEffectiveMapping(params: {
  baseMapping: Record<string, string>;
  overrideSystemFields?: Record<string, string>;
}) {
  const { baseMapping, overrideSystemFields } = params;

  if (!overrideSystemFields || Object.keys(overrideSystemFields).length === 0) {
    return { ...baseMapping };
  }

  const result: Record<string, string> = {};
  const overriddenTargets = new Set(
    Object.keys(overrideSystemFields).map((x) => String(x).trim())
  );

  for (const [excelCol, systemField] of Object.entries(baseMapping)) {
    if (overriddenTargets.has(String(systemField).trim())) {
      continue;
    }
    result[excelCol] = systemField;
  }

  for (const [systemField, excelCol] of Object.entries(overrideSystemFields)) {
    result[excelCol] = systemField;
  }

  return result;
}