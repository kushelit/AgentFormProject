import React from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

// Register the required components for the chart
ChartJS.register(ArcElement, Tooltip, Legend);

interface PieChartGraphProps {
  data: Record<string, number>;
}

const PieChartGraph: React.FC<PieChartGraphProps> = ({ data }) => {
  // Extract labels and values from the data
  const labels = Object.keys(data);
  const values = Object.values(data);

  const chartData = {
    labels, // Company names
    datasets: [
      {
        label: 'Commission Hekef Total',
        data: values, // Commission totals per company
        backgroundColor: [
          'rgba(255, 99, 132, 0.6)',
          'rgba(54, 162, 235, 0.6)',
          'rgba(255, 206, 86, 0.6)',
          'rgba(75, 192, 192, 0.6)',
          'rgba(153, 102, 255, 0.6)',
          'rgba(255, 159, 64, 0.6)',
          'rgba(201, 203, 207, 0.6)', // Additional colors for more slices
        ],
        borderColor: [
          'rgba(255, 99, 132, 1)',
          'rgba(54, 162, 235, 1)',
          'rgba(255, 206, 86, 1)',
          'rgba(75, 192, 192, 1)',
          'rgba(153, 102, 255, 1)',
          'rgba(255, 159, 64, 1)',
          'rgba(201, 203, 207, 1)', // Additional colors for more slices
        ],
        borderWidth: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false, // Allow resizing
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          font: {
            size: 12,
          },
        },
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const label = context.label || '';
            const value = context.raw || 0;
            return `${label}: ${value.toLocaleString()}`;
          },
        },
      },
      datalabels: {
        display: true,
        color: '#fff',
        formatter: (value: number, context: any) => {
          const label = context.chart.data.labels[context.dataIndex];
          return `${label}\n${value.toLocaleString()}`;
        },
        font: {
          size: 10,
        },
        anchor: 'center',
        align: 'center',
      },
    },
    cutout: '50%', // Make it a donut chart
  };

  return (
    <div style={{ width: '400px', height: '400px', margin: '0 auto' }}>
      <Doughnut data={chartData} options={options} />
    </div>
  );
};

export default PieChartGraph;
