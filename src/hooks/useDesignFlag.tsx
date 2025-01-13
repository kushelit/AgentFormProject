import { useState } from 'react';

// משתנים גלובליים
let isNewDesignEnabled: boolean = false; // עדכני את הערך כאן אם צריך לשנות ל-TRUE.

// יצירת ה-Hook
export const useDesignFlag = (): boolean => {
    return isNewDesignEnabled;
};