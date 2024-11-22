import React from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';

// Register the required components and plugins
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, ChartDataLabels);

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
        anchor: 'end' as const, // Use a valid type here
        align: 'end' as const, // Use a valid type here
        formatter: (value: number) => value.toLocaleString('en-US'),
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'ממוצע נפרעים ללקוח',
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
    },
  };

  // Generate labels from the data keys and sort them chronologically
  const labels = Object.keys(data).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  // Prepare the dataset for the chart
  const dataset = {
    labels,
    datasets: [
      {
        label: 'ממוצע נפרעים ללקוח',
        data: labels.map((label) => data[label] || 0),
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
      },
    ],
  };

  return <Line options={options} data={dataset} />;
};

export default CommissionPerCustomerGraph;
