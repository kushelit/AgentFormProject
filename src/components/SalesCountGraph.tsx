import React from 'react';
import { Chart } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
  ChartData,
} from 'chart.js';

// Register the required components for the chart
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend);

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
      duration: 500,
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
  const labels = Object.keys(newCustomerCounts || {}).sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime()
  );

  // Define the datasets with explicit types
  const dataset: ChartData<'bar', number[], string> = {
    labels,
    datasets: [
      {
        type: 'bar', // Define this dataset as a bar chart
        label: 'סה"כ לקוחות חדשים',
        data: labels.map((label) => newCustomerCounts[label] || 0),
        backgroundColor: 'rgba(53, 162, 235, 0.5)',
        borderColor: 'rgb(53, 162, 235)',
        borderWidth: 1,
      },
      {
        type: 'line', // Define this dataset as a line chart
        label: 'סה"כ לקוחות',
        data: labels.map((label) => distinctCustomerCounts[label] || 0),
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.5)',
        borderDash: [5, 5],
      },
    ],
  };

  // Use the `Chart` component with type "bar" to allow mixed chart types
  return <Chart type="bar" options={options} data={dataset} />;
};

export default SalesCountGraph;
