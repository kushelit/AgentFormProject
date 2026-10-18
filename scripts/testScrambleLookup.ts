// scripts/testScrambleLookup.ts
// בדיקת טעינה בטסט מול האקסל המקורי: מחשב מקומית את הערך המשובש של ת"ז / פוליסה / שם,
// בדיוק כמו שהטעינה בטסט משבשת אותו. לא פונה לשום שרת ולא שומר כלום.
// המפתח נקרא מ-functions/.env.magicsale-test (TEST_SCRAMBLE_KEY).
//
// שימוש:
//   npx ts-node --transpile-only -O "{\"module\":\"commonjs\"}" scripts/testScrambleLookup.ts --id 123456789 --policy 55667788 --name "ישראל ישראלי"
// אפשר כמה ערכים מכל סוג, למשל: --id 111 --id 222

import fs from 'fs';
import path from 'path';
import { fakeCustomerId, fakeFullName, fakePolicyNumber } from '../functions/src/shared/import/testScramble';

function readKey(): string {
  const envPath = path.join(__dirname, '..', 'functions', '.env.magicsale-test');
  const text = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const key = text.match(/^\s*TEST_SCRAMBLE_KEY\s*=\s*"?([^"\r\n]+)"?\s*$/m)?.[1]?.trim() ?? '';
  if (key.length < 16) {
    console.error(`TEST_SCRAMBLE_KEY לא נמצא ב-${envPath}`);
    process.exit(1);
  }
  return key;
}

const args = process.argv.slice(2);
if (!args.length) {
  console.log('שימוש: --id <ת"ז> --policy <מספר פוליסה> --name "<שם מלא>"');
  process.exit(0);
}

const key = readKey();
for (let i = 0; i < args.length; i += 2) {
  const [flag, value] = [args[i], args[i + 1] ?? ''];
  if (flag === '--id') console.log(`ת"ז      ${value}  →  ${fakeCustomerId(value, key)}`);
  else if (flag === '--policy') console.log(`פוליסה   ${value}  →  ${fakePolicyNumber(value, key)}`);
  else if (flag === '--name') console.log(`שם       ${value}  →  ${fakeFullName(value, key)}`);
  else console.log(`דגל לא מוכר: ${flag}`);
}
