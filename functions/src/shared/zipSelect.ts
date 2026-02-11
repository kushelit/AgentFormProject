export type ZipEntryRules = {
    include?: string[]; // מילות חובה בשם קובץ
    exclude?: string[]; // מילות איסור בשם קובץ
  };

function normName(name: string) {
  return String(name || "").toUpperCase();
}

function isDataFile(name: string) {
  return /\.(XLSX|XLS|CSV)$/i.test(name);
}

export function pickZipEntryName(
  entryNames: string[],
  rules?: ZipEntryRules
): { ok: true; name: string } | { ok: false; reason: string; candidates?: string[] } {
  const dataFiles = entryNames.filter((n) => isDataFile(n) && !/\/$/.test(n));

  if (!dataFiles.length) {
    return {ok: false, reason: "zip_has_no_xlsx_xls_csv"};
  }

  // אם יש רק קובץ אחד — אין מה לבחור
  if (dataFiles.length === 1) {
    return {ok: true, name: dataFiles[0]};
  }

  // אם אין חוקים — זה מצב אמביוולנטי
  if (!rules?.include?.length && !rules?.exclude?.length) {
    return {
      ok: false,
      reason: "zip_has_multiple_files_and_no_rules",
      candidates: dataFiles,
    };
  }

  const include = (rules.include || []).map((s) => normName(s));
  const exclude = (rules.exclude || []).map((s) => normName(s));

  const filtered = dataFiles.filter((n) => {
    const up = normName(n);
    const includeOk = include.length ? include.every((k) => up.includes(k)) : true;
    const excludeOk = exclude.length ? exclude.every((k) => !up.includes(k)) : true;
    return includeOk && excludeOk;
  });

  if (filtered.length === 1) return {ok: true, name: filtered[0]};

  if (!filtered.length) {
    return {
      ok: false,
      reason: "zip_rules_no_match",
      candidates: dataFiles,
    };
  }

  return {
    ok: false,
    reason: "zip_rules_ambiguous",
    candidates: filtered,
  };
}

