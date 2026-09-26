'use client';
// src/components/commission/summary/charts.tsx
// recharts בטעינה דינמית (ללא SSR) — משותף לכל לשוניות המסך
import dynamic from 'next/dynamic';
import type React from 'react';

type AnyComp = React.ComponentType<any>;

export const ResponsiveContainer = dynamic(() => import('recharts').then((m) => m.ResponsiveContainer), { ssr: false }) as AnyComp;
export const PieChart = dynamic(() => import('recharts').then((m) => m.PieChart), { ssr: false }) as AnyComp;
export const Pie = dynamic(() => import('recharts').then((m) => m.Pie), { ssr: false }) as AnyComp;
export const Cell = dynamic(() => import('recharts').then((m) => m.Cell), { ssr: false }) as AnyComp;
export const Tooltip = dynamic(() => import('recharts').then((m) => m.Tooltip), { ssr: false }) as AnyComp;
export const LineChart = dynamic(() => import('recharts').then((m) => m.LineChart), { ssr: false }) as AnyComp;
export const Line = dynamic(() => import('recharts').then((m) => m.Line), { ssr: false }) as AnyComp;
export const XAxis = dynamic(() => import('recharts').then((m) => m.XAxis), { ssr: false }) as AnyComp;
export const YAxis = dynamic(() => import('recharts').then((m) => m.YAxis), { ssr: false }) as AnyComp;
export const CartesianGrid = dynamic(() => import('recharts').then((m) => m.CartesianGrid), { ssr: false }) as AnyComp;
export const Legend = dynamic(() => import('recharts').then((m) => m.Legend), { ssr: false }) as AnyComp;
