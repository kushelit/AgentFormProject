'use client';
// src/components/admin/productMap/AliasInput.tsx
import React, { useState } from 'react';
import { normAlias } from './model';

interface Props {
  aliases: string[];
  duplicates: Set<string>; // aliases (מנורמלים) שמופיעים גם במוצר אחר
  onChange: (aliases: string[]) => void;
}

const AliasInput: React.FC<Props> = ({ aliases, duplicates, onChange }) => {
  const [text, setText] = useState('');

  const add = () => {
    const v = text.trim();
    if (!v) return;
    if (!aliases.some((a) => normAlias(a) === normAlias(v))) onChange([...aliases, v]);
    setText('');
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 border rounded-lg px-2 py-1.5 bg-white min-h-[38px]">
      {aliases.map((a, i) => {
        const dup = duplicates.has(normAlias(a));
        return (
          <span
            key={`${a}_${i}`}
            title={dup ? 'ה-alias הזה מופיע גם במוצר אחר — הראשון ברשימה ינצח' : undefined}
            className={`inline-flex items-center gap-1 text-xs rounded-md px-2 py-0.5 ${
              dup ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {a}
            <button
              type="button"
              onClick={() => onChange(aliases.filter((_, j) => j !== i))}
              className="text-slate-400 hover:text-red-600"
              aria-label="הסר"
            >
              ×
            </button>
          </span>
        );
      })}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          } else if (e.key === 'Backspace' && !text && aliases.length) {
            onChange(aliases.slice(0, -1));
          }
        }}
        onBlur={add}
        placeholder={aliases.length ? '' : 'הקלידי ערך ו-Enter'}
        className="flex-1 min-w-[140px] text-sm outline-none bg-transparent"
      />
    </div>
  );
};

export default AliasInput;
