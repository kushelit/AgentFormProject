import React from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';

// Register the required components and plugins
ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend, ChartDataLabels);

interface CommissionPerCustomerGraphProps {
  data: Record<string, number>;
}

const CommissionPerCustomerGraph: React.FC<CommissionPerCustomerGraphProps> = ({ data }) => {
  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const value = context.raw as number;
            return `${value.toLocaleString('en-US')}`;
          },
        },
      },
      datalabels: {
        display: true,
        color: 'black',
        anchor: 'end' as const,
        align: 'top' as const,
        offset: 10,
        formatter: (value: number) => value.toLocaleString('en-US'),
        font: {
          size: 12,
          weight: 'bold' as const,
        },
        textAlign: 'center' as const,
        textStrokeWidth: 0,
        borderWidth: 0,
        borderRadius: 4,
        backgroundColor: 'transparent',
        // Use translation to adjust position
        translation: [20, 0],  // [x, y] translation
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'סכום היקף שנתי מצטבר בש"ח',
        },
        ticks: {
          callback: (tickValue: number | string) => {
            if (typeof tickValue === 'number') {
              return tickValue.toLocaleString('en-US');
            }
            return tickValue;
          },
        },
      },
      x: {
        grid: {
          display: false,
        },
        ticks: {
          autoSkip: false,
          maxRotation: 0,
        },
      },
    },
    layout: {
      padding: {
        top: 30
      }
    },
  };

  // Generate labels from the data keys and sort them chronologically
  const labels = Object.keys(data).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  // Prepare the dataset for the chart
  const dataset = {
    labels,
    datasets: [
      {
        label: 'היקף לחברה', 
        data: labels.map((label) => data[label] || 0),
        backgroundColor: 'rgba(53, 162, 235, 0.5)',
        borderColor: 'rgb(53, 162, 235)',
        borderWidth: 1,
        barThickness: 40,
      },
    ],
  };

  return <Bar options={options} data={dataset} />;
};

export default CommissionPerCustomerGraph;