// ProfitByLeadSourceNifraimFocusGraph.C.tsx
import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import ChartDataLabels from 'chartjs-plugin-datalabels';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  ChartDataLabels
);

type Row = {
  leadSource: string;
  commissionHekefTotal: number;
  commissionNifraimTotal: number;
  customersCount: number;
};

export default function ProfitByLeadSourceNifraimFocusGraphC({ rows }: { rows: Row[] }) {
  const sorted = useMemo(() => {
    return [...rows].sort(
      (a, b) => (b.commissionNifraimTotal || 0) - (a.commissionNifraimTotal || 0)
    );
  }, [rows]);

  const labels = sorted.map((r) => r.leadSource);
  const nifraim = sorted.map((r) => r.commissionNifraimTotal || 0);
  const hekef = sorted.map((r) => r.commissionHekefTotal || 0);
  const customers = sorted.map((r) => r.customersCount || 0);

  const data: any = {
    labels,
    datasets: [
      // ✅ C: נפרעים כקו עבה במקום bar
      {
        type: 'line',
        label: 'עמלת נפרעים',
        data: nifraim,
        yAxisID: 'yNifraim',
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.15)',
        borderWidth: 6,
        pointRadius: 5,
        pointHoverRadius: 7,
        tension: 0.15,
        datalabels: {
          display: true,
          color: 'rgb(255, 99, 132)',
          font: { weight: 'bold', size: 13 },
          backgroundColor: 'rgba(255,255,255,0.9)',
          borderRadius: 6,
          padding: 6,
          anchor: 'end',
          align: 'top',
          offset: 8,
          formatter: (v: number) => Number(v || 0).toLocaleString(),
          textStrokeColor: 'rgba(255,255,255,1)',
          textStrokeWidth: 3,
          clamp: true,
          clip: false,
        },
      },

      // היקף – קו כחול
      {
        type: 'line',
        label: 'עמלת היקף',
        data: hekef,
        yAxisID: 'yHekef',
        borderColor: 'rgb(54, 162, 235)',
        backgroundColor: 'rgba(54, 162, 235, 0.15)',
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.25,
        datalabels: {
          display: true,
          color: 'rgb(54, 162, 235)',
          font: { weight: 'bold', size: 14 },
          backgroundColor: 'rgba(255,255,255,0.9)',
          borderRadius: 6,
          padding: 6,
          anchor: 'end',
          align: 'top',
          offset: (ctx: any) => 14 + ((ctx.dataIndex % 3) * 10),
          formatter: (v: number) => Number(v || 0).toLocaleString(),
          textStrokeColor: 'rgba(255,255,255,1)',
          textStrokeWidth: 3,
          clamp: true,
          clip: false,
        },
      },

      // לקוחות – קו ירוק
      {
        type: 'line',
        label: 'כמות לקוחות',
        data: customers,
        yAxisID: 'yCustomers',
        borderColor: 'rgb(60, 180, 75)',
        backgroundColor: 'rgba(60, 180, 75, 0.15)',
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.25,
        datalabels: {
          display: true,
          color: 'rgb(60, 180, 75)',
          font: { weight: 'bold', size: 14 },
          backgroundColor: 'rgba(255,255,255,0.9)',
          borderRadius: 6,
          padding: 6,
          anchor: 'end',
          align: 'bottom',
          offset: (ctx: any) => 18 + ((ctx.dataIndex % 3) * 10),
          formatter: (v: number) => `לקוחות: ${Number(v || 0).toLocaleString()}`,
          textStrokeColor: 'rgba(255,255,255,1)',
          textStrokeWidth: 3,
          clamp: true,
          clip: false,
        },
      },
    ],
  };

  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    layout: { padding: { top: 14 } },

    plugins: {
      datalabels: { clamp: true, clip: false },
      legend: { position: 'top' as const },
      tooltip: {
        mode: 'index',
        intersect: false,
        callbacks: {
          title: (items: any) => items?.[0]?.label ?? '',
          label: (ctx: any) => `${ctx.dataset.label}: ${Number(ctx.raw || 0).toLocaleString()}`,
        },
      },
    },

    scales: {
      x: { ticks: { maxRotation: 35, minRotation: 0 } },

      yNifraim: {
        type: 'linear',
        position: 'left',
        beginAtZero: true,
        title: { display: true, text: '₪ נפרעים' },
        grace: '25%',
        ticks: { callback: (v: any) => Number(v).toLocaleString() },
        grid: { drawOnChartArea: true },
      },

      yHekef: {
        type: 'linear',
        position: 'right',
        beginAtZero: true,
        title: { display: true, text: '₪ היקף' },
        grace: '20%',
        grid: { drawOnChartArea: false },
        ticks: { callback: (v: any) => Number(v).toLocaleString() },
      },

      yCustomers: {
        type: 'linear',
        position: 'right',
        offset: true,
        beginAtZero: true,
        title: { display: true, text: 'לקוחות' },
        grid: { drawOnChartArea: false },
        ticks: { precision: 0 },
        suggestedMax: Math.max(...customers, 0) + 1,
        grace: '15%',
      },
    },
  };

  const height = labels.length <= 2 ? 320 : 420;

  return (
    <div style={{ height }}>
      <Chart type="bar" data={data} options={options} />
    </div>
  );
}
