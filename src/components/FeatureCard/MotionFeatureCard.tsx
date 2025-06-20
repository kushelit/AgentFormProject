'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';

interface FeatureCardProps {
  title: string;
  description: string;
  image: string;
}

export default function MotionFeatureCard({ title, description, image }: FeatureCardProps) {
  return (
    <motion.div
      className="bg-white rounded-xl shadow-md overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Image src={image} alt={title} width={800} height={400} className="w-full object-cover" />
      <div className="p-6">
        <h3 className="text-2xl font-bold text-blue-800 mb-2">{title}</h3>
        <p className="text-gray-700 text-md">{description}</p>
      </div>
    </motion.div>
  );
}
