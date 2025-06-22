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
    <section id="contact" className="bg-slate-800 text-white py-20 px-6 text-right">
      <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-10">
        {/* טופס */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="שם מלא"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full p-3 rounded border border-gray-300 text-black placeholder:text-right"
          />
          <input
            type="email"
            placeholder="כתובת מייל"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full p-3 rounded border border-gray-300 text-black placeholder:text-right"
          />
          <input
            type="tel"
            placeholder="מספר טלפון"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="w-full p-3 rounded border border-gray-300 text-black placeholder:text-right"
          />
          <textarea
            placeholder="הודעה"
            rows={5}
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            className="w-full p-3 rounded border border-gray-300 text-black"
          ></textarea>
          <button
            type="submit"
            disabled={status === 'loading'}
            className={`bg-gradient-to-r from-cyan-400 to-teal-500 text-white px-6 py-2 rounded-lg font-bold transition-opacity duration-300 ${status === 'loading' ? 'opacity-50 cursor-not-allowed' : ''}`}
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
          {status === 'success' && <p className="text-green-400">ההודעה נשלחה בהצלחה!</p>}
          {status === 'error' && <p className="text-red-400">אירעה שגיאה בשליחה. נסו שוב.</p>}
          {status === 'missing' && <p className="text-yellow-400">נא למלא כתובת מייל או מספר טלפון לפחות.</p>}
        </form>

        {/* פרטים */}
        <div className="text-right">
          <h3 className="text-3xl font-bold mb-4 border-b-2 inline-block border-teal-400 pb-1">צרו איתנו קשר</h3>
          <p className="mb-4">השאירו פרטים ונשמח לחזור אליכם!</p>
          <p><strong>טלפון:</strong> 052-6582656</p>
          <p><strong>כתובת:</strong>  שרגא רפאלי 20, פתח תקווה</p>
          <p><strong>שעות פעילות:</strong> ימים א&apos;-ה&apos; בין 09:00 ל־17:00</p>
        </div>
      </div>
    </section>
  );
}
