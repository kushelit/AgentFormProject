'use client';

import { useState } from 'react';

export default function ContactSection() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' });
  const [status, setStatus] = useState<'idle' | 'success' | 'error' | 'missing' | 'loading'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');

    // Validate at least one contact method
    if (!form.email.trim() && !form.phone.trim()) {
      setStatus('missing');
      return;
    }

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName: form.name,
          userEmail: form.email,
          userPhone: form.phone,
          message: form.message
        })
      });
      if (res.ok) {
        setStatus('success');
        setForm({ name: '', email: '', phone: '', message: '' });
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  return (
    <section id="contact" className="bg-blue-50 py-20 px-6 text-right">
      <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-start">
        {/* טופס */}
        <form onSubmit={handleSubmit} className="space-y-4 bg-white shadow-lg rounded-xl p-6">
          <input
            type="text"
            placeholder="שם מלא"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full p-3 rounded border border-gray-300 placeholder:text-right"
          />
          <input
            type="email"
            placeholder="כתובת מייל"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full p-3 rounded border border-gray-300 placeholder:text-right"
          />
          <input
            type="tel"
            placeholder="מספר טלפון"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="w-full p-3 rounded border border-gray-300 placeholder:text-right"
          />
          <textarea
            placeholder="הודעה"
            rows={5}
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            className="w-full p-3 rounded border border-gray-300"
          ></textarea>
          <button
            type="submit"
            disabled={status === 'loading'}
            className={`bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded font-bold transition duration-300 ${status === 'loading' ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {status === 'loading' ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                </svg>
                שולח...
              </span>
            ) : 'שלח'}
          </button>
          {status === 'success' && <p className="text-green-600">ההודעה נשלחה בהצלחה!</p>}
          {status === 'error' && <p className="text-red-600">אירעה שגיאה בשליחה. נסו שוב.</p>}
          {status === 'missing' && <p className="text-yellow-600">נא למלא כתובת מייל או מספר טלפון לפחות.</p>}
        </form>
  
        {/* פרטים */}
        <div className="text-right text-gray-700">
          <h3 className="text-3xl font-bold mb-4 border-b-2 inline-block border-indigo-500 pb-1">צרו איתנו קשר</h3>
          <p className="mb-4">השאירו פרטים ונשמח לחזור אליכם!</p>
          <p><strong className="text-indigo-600">טלפון:</strong> 052-6582656</p>
          <p><strong className="text-indigo-600">כתובת:</strong> עזרא גבאי 3 פתח תקוה</p>
          <p><strong className="text-indigo-600">שעות פעילות:</strong> ימים א׳–ה׳ בין 09:00 ל־17:00</p>
          <p className="text-sm mt-6 text-gray-500">
            MagicSale – מערכת לניהול סוכני ביטוח | עוסק מורשה: 35780790
          </p>
        </div>
      </div>
    </section>
  );
  }
