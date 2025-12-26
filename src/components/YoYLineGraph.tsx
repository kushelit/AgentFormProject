'use client';

import React from 'react';
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
  title?: string;
  yAxisLabel: string;
  labels: string[]; // ['01','02',...]
  series: YoYSeries[];
}

const COLORS = [
  'rgba(37, 99, 235, 0.7)', // כחול – שנה נבחרת
  'rgba(22, 163, 74, 0.7)', // ירוק – שנה קודמת
  'rgba(234, 88, 12, 0.7)', // כתום – לפני שנתיים
];

export default function YoYBarGraph({
  title,
  yAxisLabel,
  labels,
  series,
}: Props) {
  const data = {
    labels,
    datasets: [...series]
    .sort((a, b) => a.year - b.year) // ✅ 2023 → 2024 → 2025
    .map((s, index) => ({
        label: String(s.year),
      data: s.data.map((v) => v ?? 0), // ✅ 0 מוצג כעמודה
      backgroundColor: COLORS[index],
      borderRadius: 4,
      barPercentage: 0.8,
      categoryPercentage: 0.7,
    })),
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' as const },
      title: title
        ? { display: true, text: title }
        : { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) =>
            `${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString()}`,
        },
      },
    },
    scales: {
      x: {
        title: { display: true, text: 'חודש' },
        stacked: false,
      },
      y: {
        beginAtZero: true,
        title: { display: true, text: yAxisLabel },
      },
    },
  };

  return (
    <div style={{ height: 420 }}>
      <Bar data={data} options={options as any} />
    </div>
  );
}
