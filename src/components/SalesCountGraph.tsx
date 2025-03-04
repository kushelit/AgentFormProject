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
  ChartOptions
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

  const options: ChartOptions<'bar' | 'line'> = {
    responsive: true,
    animation: {
      duration: 500,
    },
    plugins: {
      legend: {
        position: 'top',
      },
    },
    scales: {
      y: {
        type: 'linear', // ✅ נגדיר את זה כערך מפורש
        beginAtZero: true,
        position: 'left',
        title: {
          display: true,
          text: 'לקוחות חדשים',
        },
      } as const, // ✅ הוספת `as const` כדי למנוע בעיית טיפוס
      y2: {
        type: 'linear', // ✅ גם כאן מוודאים שהציר לינארי
        beginAtZero: true,
        position: 'right',
        title: {
          display: true,
          text: 'סה"כ לקוחות מצטברים',
        },
        grid: {
          drawOnChartArea: false, // ✅ מונע חפיפה של קווי הרשת עם y1
        },
      } as const,
    },
  };

  // יצירת רשימת תאריכים מסודרת
  const labels = Object.keys(newCustomerCounts || {}).sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime()
  );

  // הגדרת מערך הנתונים
  const dataset: ChartData<'bar' | 'line', number[], string> = {
    labels,
    datasets: [
      {
        type: 'bar', // ✅ מלבנים עבור לקוחות חדשים
        label: 'לקוחות חדשים',
        data: labels.map((label) => newCustomerCounts[label] || 0),
        backgroundColor: 'rgba(53, 162, 235, 0.5)',
        borderColor: 'rgb(53, 162, 235)',
        borderWidth: 1,
        yAxisID: 'y', // ✅ משויך לציר השמאלי
      },
      {
        type: 'line', // ✅ קו עבור סה"כ לקוחות מצטברים
        label: 'סה"כ לקוחות מצטברים',
        data: labels.map((label) => distinctCustomerCounts[label] || 0),
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.5)',
        borderDash: [5, 5],
        yAxisID: 'y2', // ✅ משויך לציר הימני
      },
    ],
  };

  return <Chart type="bar" options={options} data={dataset} />;
};

export default SalesCountGraph;
