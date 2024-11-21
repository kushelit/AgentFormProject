import React from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from 'chart.js';

// Register the required components for the chart
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);
//ChartJS.defaults.plugins.datalabels = undefined;

interface SalesCountGraphProps {
  data: {
    newCustomerCounts: Record<string, number>;
    distinctCustomerCounts: Record<string, number>;
  };
}

const SalesCountGraph: React.FC<SalesCountGraphProps> = ({ data }) => {
  const { newCustomerCounts, distinctCustomerCounts } = data;

  const options = {
    responsive: true,
    animation: {
      duration: 500, // Shorten the animation duration (default is 1000ms)
    },

    plugins: {
      legend: {
        position: 'top' as const,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'כמות לקוחות',
        },
      },
    },
  };

  // Generate labels from the data keys and sort them chronologically
  const labels = Object.keys(newCustomerCounts || {}).sort((a, b) => {
    return new Date(a).getTime() - new Date(b).getTime();
  });
  // Prepare the datasets for the chart
  const dataset = {
    labels,
    datasets: [
      {
        label: 'סה"כ לקוחות חדשים',
        data: labels.map((label) => newCustomerCounts[label] || 0),
        borderColor: 'rgb(53, 162, 235)',
        backgroundColor: 'rgba(53, 162, 235, 0.5)',
      },
      {
        label: 'סה"כ לקוחות',
        data: labels.map((label) => distinctCustomerCounts[label] || 0),
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.5)',
        borderDash: [5, 5], // Dashed line for distinction
      },
    ],
  };

  return <Line options={options} data={dataset} />;
};

export default SalesCountGraph;
