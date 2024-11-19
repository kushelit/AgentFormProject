import React from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from 'chart.js';

// Register the required components for the chart
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

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
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Commission Per Customer (NIS)', // Update the title
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
        label: 'Commission Per Customer', // Update the label
        data: labels.map((label) => data[label] || 0),
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
      },
    ],
  };

  return <Line options={options} data={dataset} />;
};

export default CommissionPerCustomerGraph;
