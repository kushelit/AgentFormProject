'use client';

import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

export type YoYSeries = {
  year: number;
  data: Array<number | null>;
};

interface Props {
  title?: string;
  yAxisLabel: string;
  labels: string[]; // ['01'..'12']
  series: YoYSeries[];
}

const COLORS = [
  { border: '#2563EB', background: 'rgba(37,99,235,0.15)' },
  { border: '#16A34A', background: 'rgba(22,163,74,0.15)' },
  { border: '#EA580C', background: 'rgba(234,88,12,0.15)' },
];

export default function YoYLineGraph({ title, yAxisLabel, labels, series }: Props) {
  const data = {
    labels,
    datasets: series.map((s, index) => ({
      label: String(s.year),
      data: s.data.map((v) => (v ?? 0)), // ✅ null -> 0 (לא לחתוך קו)
      borderColor: COLORS[index]?.border,
      backgroundColor: COLORS[index]?.background,
      borderWidth: index === 0 ? 3 : 2,
      pointRadius: 4,
      pointHoverRadius: 6,
      tension: 0.3,
      fill: false,
    })),
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' as const },
      title: title ? { display: true, text: title } : { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) => `${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString()}`,
        },
      },
    },
    scales: {
      x: { title: { display: true, text: 'חודש' } },
      y: { beginAtZero: true, title: { display: true, text: yAxisLabel } },
    },
  };

  return (
    <div style={{ height: 400 }}>
      <Line data={data} options={options as any} />
    </div>
  );
}
