import React from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from 'chart.js';

// Register the required components for the chart
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

interface SalesCountGraphProps {
  data: Record<string, number>;
}

const SalesCountGraph: React.FC<SalesCountGraphProps> = ({ data }) => {
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
          text: 'Number of Sales'
        }
      }
    }
  };

  // Generate labels from the data keys and sort them if needed
  const labels = Object.keys(data).sort(); // Sorting keys to ensure the order

  // Prepare the dataset for the chart
  const dataset = {
    labels,
    datasets: [
      {
        label: 'Sales per Month',
        data: labels.map(label => {
          if (data[label] === undefined) {
            console.warn(`No data for month: ${label}`);
            return 0; // Default to 0 if data for a label is missing
          }
          return data[label];
        }),
        borderColor: 'rgb(53, 162, 235)',
        backgroundColor: 'rgba(53, 162, 235, 0.5)',
      }
    ],
  };

  return <Line options={options} data={dataset} />;
};

export default SalesCountGraph;