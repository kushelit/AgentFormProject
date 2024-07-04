import React from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface MonthlyCompanyCommissions {
    [month: string]: {
        [company: string]: number;
    };
}

interface CommissionGraphProps {
    data: MonthlyCompanyCommissions;
}

const CommissionGraph: React.FC<CommissionGraphProps> = ({ data }) => {
    const labels = Object.keys(data);
    const datasetEntries = Object.entries(data[labels[0]] || {}).map(([company]) => {
        return {
            label: company,
            data: labels.map(month => data[month][company] || 0),
            backgroundColor: getRandomColor(),  // Assign a unique color for each company
        };
    });

    const chartData = {
        labels,
        datasets: datasetEntries,
    };

    const options = {
        responsive: true,
        plugins: {
            legend: {
                position: 'top' as const, // Ensuring the value is treated as a specific literal
            },
        },
        scales: {
            x: {
                stacked: true,
            },
            y: {
                stacked: true,
            },
        },
    };
    
    return <Bar data={chartData} options={options} />;
};

function getRandomColor() {
    var letters = '0123456789ABCDEF';
    var color = '#';
    for (var i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

export default CommissionGraph;