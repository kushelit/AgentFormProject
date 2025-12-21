export default function PricingDetailsPage() {
    return (
      <div className="min-h-screen bg-gray-50 py-16 px-4 text-right">
        <div className="max-w-4xl mx-auto bg-white p-10 rounded-xl shadow-md border border-gray-200">
  
          <h1 className="text-3xl font-bold text-blue-800 mb-6">
            מחירון שירותים ותוספות – MagicSale
          </h1>
  
          <p className="text-gray-600 mb-10">
            דף זה מפרט עלויות נוספות ושירותי פרימיום המוצעים לפי דרישה. שירותים אלה אינם כלולים בחבילות המנוי הבסיסיות.
          </p>
  
          {/* תוספות חודשיות */}
          <h2 className="text-xl font-semibold text-gray-800 mb-4">תוספות חודשיות למנוי</h2>
  
          <div className="rounded-lg overflow-hidden border border-yellow-200 text-sm mb-10">
            <div className="flex justify-between bg-yellow-50 p-4 border-b border-yellow-100">
              <span className="font-medium">עובד נוסף במנוי Pro</span>
              <span className="font-semibold">49 ₪ לחודש + מע״מ</span>
            </div>
  
            <div className="flex justify-between bg-yellow-50 p-4">
              <span className="font-medium">
                הרחבת כמות לקוחות מעבר ל־2,000{' '}
                <span className="text-xs text-gray-600">(כל 2,000 לקוחות נוספים או חלק מהם)</span>
              </span>
              <span className="font-semibold">50 ₪ לחודש + מע״מ</span>
            </div>

            <div className="flex justify-between bg-yellow-50 p-4 border-b border-yellow-100">
              <span className="font-medium">שירות טעינה חודשית של קבצי עמלות מחברות הביטוח</span>
              <span className="font-semibold">100 ₪ לחודש + מע״מ</span>
            </div>
          </div>
  
          {/* שירותים חד פעמיים */}
          <h2 className="text-xl font-semibold text-gray-800 mb-4">שירותים חד־פעמיים / לפי שעה</h2>
  
          <div className="space-y-3 text-sm mb-10">
            <div className="bg-yellow-50 px-4 py-3 rounded border border-yellow-100">
              <span className="font-medium">שעת אפיון / ייעוץ למערכת</span>
              <p className="text-gray-700 mt-1">להגדרת תהליכים, דוחות והתאמות למערכת. התמחור יתואם מראש לפי היקף העבודה.</p>
            </div>
  
            <div className="bg-yellow-50 px-4 py-3 rounded border border-yellow-100">
              <span className="font-medium">שעת פיתוח / התאמות מיוחדות</span>
              <p className="text-gray-700 mt-1">פיתוח יכולות ייעודיות, שדות מיוחדים ודוחות מותאמים. תמחור לפי שעה.</p>
            </div>
  
            <div className="bg-yellow-50 px-4 py-3 rounded border border-yellow-100">
              <span className="font-medium">שירות קליטת קבצים ונתונים</span>
              <p className="text-gray-700 mt-1">טעינה ראשונית של נתונים, עמלות, עסקאות ולקוחות. חיוב לפי זמן עבודה בפועל.</p>
            </div>
          </div>
  
          <p className="text-xs text-gray-500">
            * כל השירותים מוצעים לפי דרישה ובתיאום מראש.  
            * המחירים אינם כוללים מע״מ.
          </p>
        </div>
      </div>
    );
  }
  