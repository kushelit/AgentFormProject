'use client';

import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export type YoYSeries = {
  year: number;
  data: Array<number | null>;
};

interface Props {
  labels: string[]; // ['01','02',...,'12']
  series: YoYSeries[];
}

const COLORS = [
  { border: '#EA580C', background: 'rgba(234,88,12,0.55)' }, // הכי ישנה (משמאל)
  { border: '#16A34A', background: 'rgba(22,163,74,0.55)' }, // אמצע
  { border: '#2563EB', background: 'rgba(37,99,235,0.55)' }, // הכי חדשה (מימין)
];

const NifraimYoYGraph: React.FC<Props> = ({ labels, series }) => {
  // ✅ 2023 → 2024 → 2025 (משמאל לימין)
  const sortedSeries = useMemo(() => [...series].sort((a, b) => a.year - b.year), [series]);

  const data = useMemo(() => {
    return {
      labels,
      datasets: sortedSeries.map((s, index) => ({
        label: String(s.year),
        data: s.data.map((v) => v ?? 0), // ✅ null => 0
        borderColor: COLORS[index]?.border,
        backgroundColor: COLORS[index]?.background,
        borderWidth: 1,
        // ✅ עמודות "צמודות" בקבוצה של החודש
        categoryPercentage: 0.7,
        barPercentage: 0.9,
      })),
    };
  }, [labels, sortedSeries]);

  const options = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top' as const,
          // הסדר במקרא כבר יהיה לפי datasets (2023→2025)
        },
        tooltip: {
          callbacks: {
            label: (ctx: any) =>
              `${ctx.dataset.label}: ${Number(ctx.parsed.y || 0).toLocaleString()}`,
          },
        },
      },
      scales: {
        x: { title: { display: true, text: 'חודש' } },
        y: { beginAtZero: true, title: { display: true, text: 'נפרעים' } },
      },
    };
  }, []);

  return (
    <div style={{ height: 420 }}>
      <Bar data={data} options={options} />
    </div>
  );
};

export default NifraimYoYGraph;
