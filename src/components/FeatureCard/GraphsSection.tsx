'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import MotionFeatureCard from './MotionFeatureCard';

const graphs = [
  {
    title: 'פיצול לפי חברת ביטוח',
    description: 'ניתוח הסכומים שהוזנו לפי חברות – כדי לראות איפה אתם מרוויחים יותר.',
    image: '/static/img/landingImg/graph-import-3.png'

  },
  {
    title: 'ממוצע הכנסות ללקוח',
    description: 'מבט ברור על מגמת השינוי ברווחיות – להבין מה עובד ומה פחות.',
    image: '/static/img/landingImg/graph-import-2.png'
  },
  {
    title: 'גיוס לקוחות חדשים',
    description: 'מעקב קל אחר גידול בלקוחות חדשים והצטברות חודשית.',
    image: '/static/img/landingImg/graph-import-1.png'
  }
];

export default function GraphsSection() {
  return (
    <section className="py-20 bg-gray-100 text-right">
      <div className="max-w-7xl mx-auto px-6">
        <h2 className="text-3xl font-bold text-blue-800 mb-10">לוחות בקרה חכמים</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {graphs.map((graph) => (
            <MotionFeatureCard
              key={graph.title}
              title={graph.title}
              description={graph.description}
              image={graph.image}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
