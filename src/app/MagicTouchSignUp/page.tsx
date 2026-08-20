'use client';

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Link from 'next/link';
import Image from 'next/image';

interface Plan {
  id: string;
  name: string;
  price: number;
  description: string;
  permissions: string[];
  maxUsers: number;
  signupChannels?: string[];
}

const planFeatures: Record<string, string[]> = {
  magic_touch: [
    'ניהול תקשורת ותהליכים ב-MagicTouch',
    'עבודה עם WhatsApp כחלק מתהליך העבודה',
    'מעקב אחר אנשי קשר, שיחות ותהליכים במקום אחד',
    'חיבור לאינטגרציות ותהליכים אוטומטיים לפי הצורך',
    'כולל סוכן + עובד אחד',
    'ניתן להוסיף עובדים נוספים בתשלום',
  ],
  magic_suite: [
    'כל מה שכלול ב-MagicTouch',
    'כל מה שכלול במנוי MagicSale Pro',
    'ניהול עסקאות, לקוחות ועמלות',
    'ניהול עובדים והרשאות',
    'טעינה וניתוח של נתוני עמלות',
    'כולל סוכן + עובד אחד',
    'ניתן להוסיף עובדים נוספים בתשלום',
  ],
};

const planSubtitles: Record<string, string> = {
  magic_touch: 'MagicTouch בלבד – לניהול התהליך והתקשורת עם הלקוח',
  magic_suite:
    'MagicSale Pro + MagicTouch – המידע העסקי והתהליך במקום אחד',
};

export default function MagicTouchSignUpPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState('');

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [extraWorkers, setExtraWorkers] = useState(0);

  const [couponCode, setCouponCode] = useState('');
  const [discount, setDiscount] = useState(0);
  const [couponError, setCouponError] = useState('');

  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState('');

  const [fieldErrors, setFieldErrors] = useState<{
    fullName?: string;
    email?: string;
    phone?: string;
    idNumber?: string;
  }>({});

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const res = await axios.get(
          '/api/subscription-plans?channel=touch'
        );

        const touchPlans: Plan[] = Array.isArray(res.data)
          ? res.data
          : [];

        setPlans(touchPlans);

        if (touchPlans.length > 0) {
          const defaultPlan =
            touchPlans.find(
              (p) => p.id === 'magic_touch'
            ) ?? touchPlans[0];

          setSelectedPlan(defaultPlan.id);
        }
      } catch {
        setError(
          'לא ניתן לטעון כרגע את תוכניות MagicTouch.'
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchPlans();
  }, []);

  const orderedPlans = useMemo(() => {
    const order = ['magic_touch', 'magic_suite'];

    return [...plans].sort(
      (a, b) =>
        order.indexOf(a.id) - order.indexOf(b.id)
    );
  }, [plans]);

  const supportsExtraWorkers = [
    'magic_touch',
    'magic_suite',
  ].includes(selectedPlan);

  const checkCoupon = async (
    code: string,
    plan: string
  ) => {
    if (!code || !plan) {
      setDiscount(0);
      setCouponError('');
      return;
    }

    try {
      const res = await axios.post(
        '/api/validate-coupon',
        {
          couponCode: code.trim(),
          plan,
        }
      );

      if (res.data?.valid) {
        setDiscount(
          Number(res.data.discount || 0)
        );
        setCouponError('');
      } else {
        setDiscount(0);
        setCouponError(
          res.data?.reason ||
            'קוד הקופון אינו תקף'
        );
      }
    } catch (err: any) {
      setDiscount(0);
      setCouponError(
        err?.response?.data?.error ||
          'שגיאה בעת אימות קוד הקופון'
      );
    }
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      checkCoupon(
        couponCode,
        selectedPlan
      );
    }, 250);

    return () => clearTimeout(timeout);
  }, [couponCode, selectedPlan]);

  const calculateTotal = (
    discountValue: number = discount
  ) => {
    const basePrice =
      plans.find(
        (plan) => plan.id === selectedPlan
      )?.price || 0;

    const extraWorkersPrice =
      supportsExtraWorkers &&
      extraWorkers > 0
        ? extraWorkers * 49
        : 0;

    let total =
      basePrice + extraWorkersPrice;

    if (discountValue > 0) {
      total -=
        total * (discountValue / 100);
    }

    if (total <= 0) total = 1;

    const VAT_RATE = 0.18;

    total *= 1 + VAT_RATE;

    return parseFloat(
      total.toFixed(2)
    );
  };

  const isValidIsraeliIdOrCorp = (
    id: string
  ) => {
    const cleanId = id.trim();

    if (!/^\d{5,10}$/.test(cleanId))
      return false;

    const paddedId =
      cleanId.padStart(9, '0');

    let sum = 0;

    for (let i = 0; i < 9; i++) {
      let digit =
        Number(paddedId[i]) *
        ((i % 2) + 1);

      if (digit > 9) digit -= 9;

      sum += digit;
    }

    return sum % 10 === 0;
  };

  const isValidIsraeliPhone = (
    value: string
  ) => {
    const cleanPhone =
      value.replace(/\D/g, '');

    return /^05[0-9]{8}$/.test(
      cleanPhone
    );
  };

  const isValidFullName = (
    name: string
  ) => {
    const parts =
      name.trim().split(/\s+/);

    return (
      parts.length >= 2 &&
      parts.every(
        (part) => part.length >= 2
      )
    );
  };

  const handleSubmit = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    setError('');
    setFieldErrors({});

    if (!selectedPlan) {
      setError('יש לבחור תוכנית.');
      return;
    }

    if (!acceptTerms) {
      setError(
        'יש לאשר את תנאי השימוש לפני המשך התשלום.'
      );
      return;
    }

    if (
      !isValidIsraeliIdOrCorp(
        idNumber
      )
    ) {
      setFieldErrors((prev) => ({
        ...prev,
        idNumber:
          'מספר ת"ז / ח.פ אינו תקין',
      }));
      return;
    }

    if (
      !isValidIsraeliPhone(phone)
    ) {
      setFieldErrors((prev) => ({
        ...prev,
        phone:
          'מספר טלפון נייד לא תקין',
      }));
      return;
    }

    if (
      !isValidFullName(fullName)
    ) {
      setFieldErrors((prev) => ({
        ...prev,
        fullName:
          'יש להזין שם מלא – לפחות שם פרטי ושם משפחה.',
      }));
      return;
    }

    setIsSubmitting(true);

    try {
      let finalDiscount = 0;

      const trimmedCoupon =
        couponCode.trim();

      if (trimmedCoupon) {
        try {
          const couponRes =
            await axios.post(
              '/api/validate-coupon',
              {
                couponCode:
                  trimmedCoupon,
                plan: selectedPlan,
              }
            );

          finalDiscount =
            couponRes.data?.valid
              ? Number(
                  couponRes.data
                    .discount || 0
                )
              : 0;

          setCouponError(
            couponRes.data?.valid
              ? ''
              : couponRes.data
                  ?.reason ||
                  'קוד הקופון אינו תקף'
          );
        } catch (
          couponErr: any
        ) {
          finalDiscount = 0;

          setCouponError(
            couponErr?.response?.data
              ?.error ||
              'שגיאה בעת אימות קוד הקופון'
          );
        }
      }

      const total =
        calculateTotal(
          finalDiscount
        );

      const payload: any = {
        fullName,
        email,
        phone,
        idNumber,
        plan: selectedPlan,

        addOns: {
          leadsModule: false,
          extraWorkers:
            supportsExtraWorkers
              ? extraWorkers
              : 0,
        },

        total,

        source:
          'magic-touch-signup',
      };

      if (trimmedCoupon) {
        payload.couponCode =
          trimmedCoupon;
      }

      const res = await axios.post(
        '/api/create-subscription',
        payload,
        {
          headers: {
            'Content-Type':
              'application/json',
          },
        }
      );

      const { paymentUrl } =
        res.data;

      if (!paymentUrl) {
        setError(
          'אירעה שגיאה לא צפויה ביצירת התשלום.'
        );
        return;
      }

      window.location.href =
        paymentUrl;
    } catch (err: any) {
      const msg =
        err?.response?.data
          ?.error || 'שגיאה כללית';

      const status =
        err?.response?.status;

      if (status === 400) {
        if (
          msg.includes('שם מלא')
        ) {
          setFieldErrors(
            (prev) => ({
              ...prev,
              fullName: msg,
            })
          );
        } else if (
          msg.includes('טלפון')
        ) {
          setFieldErrors(
            (prev) => ({
              ...prev,
              phone: msg,
            })
          );
        } else {
          setError(msg);
        }
      } else if (
        status === 503 ||
        status === 504
      ) {
        setError(msg);
      } else {
        setError(
          'אירעה שגיאה. אנא נסו שוב או פנו לתמיכה.'
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#050817] flex items-center justify-center text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-300 mx-auto mb-4" />

          <p className="text-slate-300">
            טוען תוכניות...
          </p>
        </div>
      </div>
    );
  }

  if (!plans.length) {
    return (
      <div className="min-h-screen bg-[#050817] flex items-center justify-center p-6 text-white">
        <div className="max-w-md w-full rounded-3xl border border-white/10 bg-white/[0.06] p-8 text-center shadow-2xl backdrop-blur">
          <h1 className="text-xl font-semibold mb-3">
            לא נמצאו תוכניות
            MagicTouch פעילות
          </h1>

          <p className="text-sm text-slate-300 mb-6">
            נסו שוב מאוחר יותר או
            פנו אלינו לקבלת עזרה.
          </p>

          <Link
            href="/MagicTouchLanding"
            className="inline-flex items-center justify-center rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
          >
            חזרה ל-MagicTouch
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main
      className="relative min-h-screen overflow-hidden bg-[#050817] text-white"
      dir="rtl"
    >
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#050817] via-[#0b1230] to-[#211449]" />

      <div className="absolute -right-32 top-20 h-[520px] w-[520px] rounded-full bg-purple-500/20 blur-[130px]" />

      <div className="absolute -left-20 bottom-0 h-[420px] w-[420px] rounded-full bg-cyan-400/15 blur-[130px]" />

      <div className="absolute left-[25%] top-[35%] h-[300px] w-[300px] rounded-full bg-blue-500/10 blur-[120px]" />

      <div className="relative z-10 mx-auto max-w-6xl px-6 py-7 md:px-10">

        {/* Header */}
        <header className="mb-12 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/static/img/landingImg/union-5.png"
              alt="MagicSale"
              width={150}
              height={40}
              className="h-auto w-28 sm:w-36"
            />

            <div className="hidden h-7 w-px bg-white/20 md:block" />

            <div className="hidden md:block">
              <div className="text-base font-medium">
                MagicTouch
              </div>

              <div className="text-sm text-cyan-300">
                Smart Process
                Automation
              </div>

              <a
                href="https://www.unamix.co.il/"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 block text-[11px] text-slate-400 transition hover:text-cyan-300"
              >
                מבית Unamix
              </a>
            </div>
          </div>

          <Link
            href="/MagicTouchLanding"
            className="rounded-xl border border-cyan-300/30 bg-cyan-300/5 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-300/10"
          >
            חזרה ל-MagicTouch
          </Link>
        </header>

        {/* Hero */}
        <section className="mx-auto mb-10 max-w-4xl text-center">
          <div className="mb-3 text-base font-medium text-cyan-300">
            בחרו איך להתחיל
          </div>

          <h1 className="text-4xl font-semibold leading-tight md:text-5xl">
            MagicTouch בלבד,
            <br />
            או MagicSale + MagicTouch
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-300">
            שתי אפשרויות, מנוי אחד,
            ואפשרות לשנות מסלול גם
            בהמשך.
          </p>
        </section>

        <form
          onSubmit={handleSubmit}
          className="space-y-8 rounded-[30px] border border-cyan-300/15 bg-gradient-to-br from-white/[0.08] via-white/[0.055] to-purple-400/[0.05] p-6 shadow-2xl backdrop-blur md:p-8"
        >
          {/* Plans */}
          <section>
            <h2 className="mb-5 text-xl font-medium text-white">
              בחירת תוכנית
            </h2>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {orderedPlans.map(
                (plan) => {
                  const selected =
                    selectedPlan ===
                    plan.id;

                  const isSuite =
                    plan.id ===
                    'magic_suite';

                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() =>
                        setSelectedPlan(
                          plan.id
                        )
                      }
                      className={`relative flex min-h-[330px] flex-col justify-between rounded-3xl border p-6 text-right transition ${
                        selected
                          ? 'border-cyan-300/80 bg-gradient-to-br from-cyan-300/15 via-blue-400/10 to-purple-400/10 ring-2 ring-cyan-300/20 shadow-lg shadow-cyan-950/20'
                          : 'border-white/10 bg-white/[0.045] hover:border-cyan-300/40 hover:bg-white/[0.07]'
                      }`}
                    >
                      {isSuite && (
                        <span className="absolute left-5 top-5 rounded-full bg-gradient-to-r from-cyan-400 to-blue-400 px-3 py-1 text-xs font-medium text-slate-950">
                          משולב
                        </span>
                      )}

                      <div>
                        <div className="text-sm font-medium tracking-wide text-cyan-300">
                          {plan.id ===
                          'magic_touch'
                            ? 'MagicTouch'
                            : 'MagicSale + MagicTouch'}
                        </div>

                        <h3 className="mt-2 text-2xl font-semibold text-white">
                          {plan.name}
                        </h3>

                        <p className="mt-3 text-sm leading-6 text-slate-300">
                          {planSubtitles[
                            plan.id
                          ] ||
                            plan.description}
                        </p>

                        <ul className="mt-6 space-y-3 text-sm text-slate-200">
                          {(
                            planFeatures[
                              plan.id
                            ] || []
                          ).map(
                            (
                              feature,
                              index
                            ) => (
                              <li
                                key={
                                  index
                                }
                                className="flex items-start gap-2"
                              >
                                <span className="mt-0.5 text-cyan-300">
                                  ✓
                                </span>

                                <span>
                                  {
                                    feature
                                  }
                                </span>
                              </li>
                            )
                          )}
                        </ul>
                      </div>

                      <div className="mt-7 flex items-end justify-between gap-4">
                        <div>
                          <span className="text-3xl font-semibold text-white">
                            ₪
                            {
                              plan.price
                            }
                          </span>

                         <span className="mr-1 text-sm text-slate-400">
  לחודש + מע&quot;מ
</span>
                        </div>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${
                            selected
                              ? 'bg-cyan-400 text-slate-950'
                              : 'bg-white/10 text-slate-300'
                          }`}
                        >
                          {selected
                            ? 'נבחר'
                            : 'בחירה'}
                        </span>
                      </div>
                    </button>
                  );
                }
              )}
            </div>
          </section>

          {/* Extra workers */}
          <section className="rounded-2xl border border-cyan-300/15 bg-gradient-to-l from-cyan-400/[0.07] to-purple-400/[0.05] p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-medium text-white">
                  עובדים נוספים
                </h2>

              <p className="mt-1 text-sm text-slate-300">
  כל עובד נוסף מעבר לעובד הכלול במנוי:
  49 ₪ לחודש + מע&quot;מ.
</p>
              </div>

              <input
                type="number"
                min={0}
                value={extraWorkers}
                disabled={
                  !supportsExtraWorkers
                }
                onChange={(e) =>
                  setExtraWorkers(
                    Math.max(
                      0,
                      Number(
                        e.target.value
                      ) || 0
                    )
                  )
                }
                className="w-24 rounded-xl border border-cyan-300/20 bg-white/10 px-3 py-2 text-center text-base text-white outline-none transition focus:border-cyan-300 disabled:opacity-50"
              />
            </div>
          </section>

          {/* Account */}
          <section>
            <h2 className="mb-5 text-xl font-medium text-white">
              פרטי החשבון
            </h2>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field
                label='ת"ז / ח.פ *'
                value={idNumber}
                onChange={
                  setIdNumber
                }
                error={
                  fieldErrors.idNumber
                }
              />

              <Field
                label="שם מלא *"
                value={fullName}
                onChange={
                  setFullName
                }
                error={
                  fieldErrors.fullName
                }
              />

              <Field
                label="אימייל *"
                value={email}
                onChange={setEmail}
                type="email"
                error={
                  fieldErrors.email
                }
              />

              <Field
                label="טלפון *"
                value={phone}
                onChange={setPhone}
                type="tel"
                placeholder="05XXXXXXXX"
                error={
                  fieldErrors.phone
                }
              />
            </div>
          </section>

          {/* Coupon + total */}
          <section className="grid grid-cols-1 items-end gap-4 md:grid-cols-[1fr_auto]">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-200">
                קוד קופון
              </label>

              <input
                type="text"
                value={couponCode}
                onChange={(e) =>
                  setCouponCode(
                    e.target.value.trim()
                  )
                }
                className="w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-right text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300"
                placeholder="יש לך קופון?"
              />

              {couponError && (
                <p className="mt-1 text-sm text-red-300">
                  {couponError}
                </p>
              )}

              {discount > 0 && (
                <p className="mt-1 text-sm font-medium text-emerald-300">
                  קופון הנחה של{' '}
                  {discount}% הופעל
                </p>
              )}
            </div>

            <div className="min-w-[250px] rounded-2xl border border-cyan-300/30 bg-gradient-to-br from-cyan-300/15 to-blue-400/10 px-5 py-4">
             <div className="text-xs font-medium text-cyan-200">
  סה&quot;כ לתשלום
</div>

              <div className="mt-1 text-3xl font-semibold text-white">
                ₪
                {calculateTotal().toFixed(
                  2
                )}
              </div>

             <div className="mt-1 text-xs text-slate-400">
  כולל מע&quot;מ
</div>
            </div>
          </section>

          {/* Terms */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
            <label className="flex items-start gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={
                  acceptTerms
                }
                onChange={(e) =>
                  setAcceptTerms(
                    e.target.checked
                  )
                }
                className="mt-1 h-4 w-4 accent-cyan-400"
              />

              <span>
                אני מאשר/ת שקראתי
                והסכמתי ל{' '}
                <Link
                  href="/MagicTouchTerms"
                  target="_blank"
                  className="font-medium text-cyan-300 underline underline-offset-2 transition hover:text-cyan-200"
                >
                  תנאי השימוש
                </Link>
                {' '}ול{' '}
                <Link
                  href="/MagicTouchPrivacy"
                  target="_blank"
                  className="font-medium text-cyan-300 underline underline-offset-2 transition hover:text-cyan-200"
                >
                  מדיניות הפרטיות
                </Link>
                {' '}של MagicTouch.
              </span>
            </label>
          </section>

          {error && (
            <div className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm font-medium text-red-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={
              isSubmitting ||
              !selectedPlan
            }
            className="w-full rounded-2xl bg-gradient-to-l from-cyan-400 to-cyan-300 py-4 text-base font-semibold text-slate-950 shadow-lg shadow-cyan-950/30 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting
              ? 'מעביר לתשלום...'
              : 'המשך לתשלום מאובטח'}
          </button>

          <p className="text-center text-xs text-slate-500">
            התשלום מתבצע באופן
            מאובטח באמצעות GROW
          </p>
        </form>

        {/* Unamix footer */}
        <footer className="mt-10 border-t border-white/10 pt-7 pb-6">
          <div className="flex flex-col items-center justify-between gap-5 sm:flex-row">
            <div>
              <div className="text-sm text-slate-400">
                MagicTouch מבית
              </div>

              <a
                href="https://www.unamix.co.il/"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-baseline gap-2 text-lg font-medium text-cyan-300 transition hover:text-cyan-200"
              >
                <span>Unamix</span>

                <span className="text-xs font-normal text-slate-400">
                  Technological
                  Solutions
                </span>
              </a>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-5 text-xs text-slate-400">
              <Link
                href="/MagicTouchTerms"
                className="transition hover:text-cyan-300"
              >
                תנאי שימוש
              </Link>

              <Link
                href="/MagicTouchPrivacy"
                className="transition hover:text-cyan-300"
              >
                מדיניות פרטיות
              </Link>

              <a
                href="https://www.unamix.co.il/"
                target="_blank"
                rel="noopener noreferrer"
                className="transition hover:text-cyan-300"
              >
                אתר Unamix
              </a>
            </div>
          </div>

       <div className="mt-6 text-center text-[11px] text-slate-500">
  © 2026 יונמיקס פתרונות טכנולוגיים בע&quot;מ
</div>
        </footer>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  error,
}: {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
  type?: string;
  placeholder?: string;
  error?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-200">
        {label}
      </label>

      <input
        type={type}
        value={value}
        onChange={(e) =>
          onChange(e.target.value)
        }
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-right text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:bg-white/[0.12]"
        required
      />

      {error && (
        <p className="mt-1 text-sm text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}