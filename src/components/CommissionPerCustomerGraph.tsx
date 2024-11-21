import React from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';

// Register the required components and plugins for the chart
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, ChartDataLabels);

interface CommissionPerCustomerGraphProps {
  data: Record<string, number>;
}

const CommissionPerCustomerGraph: React.FC<CommissionPerCustomerGraphProps> = ({ data }) => {
  const options = {
    responsive: true,
    animation: {
      duration: 500, // Shorten the animation duration
    },
    plugins: {
      legend: {
        position: 'top' as const,
      },
      datalabels: {
        display: (context: any) => {
          // Display labels only for the last data point
          return context.dataIndex === context.dataset.data.length - 1;
        },
        align: 'end' as const, // Use `as const` to match expected types
        anchor: 'end' as const, // Use `as const` to match expected types
        color: '#000',
        font: {
          weight: 'bold' as const, // Use `as const` for strict type compatibility
        },
        formatter: (value: number) => value.toLocaleString(), // Format numbers with commas
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'ממוצע נפרעים ללקוח', // Update the title
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
        label: 'ממוצע נפרעים ללקוח', // Update the label
        data: labels.map((label) => data[label] || 0),
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
      },
    ],
  };

  return <Line options={options} data={dataset} />;
};

export default CommissionPerCustomerGraph;
