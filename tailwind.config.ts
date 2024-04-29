import formPlugin from '@tailwindcss/forms';

const config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        'custom-blue': '#0b2A5C',
        'custom-white': '#ffffff', 
        'custom-green': '#90de3d',
        'custom-light-blue':'#236192',
        'custom-grey':'#9ea2a2'
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [
    formPlugin, // Ensure your plugins are listed here
  ],
};

module.exports = config; // Correct way to export in Node.js environment