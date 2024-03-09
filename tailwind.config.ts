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
        'custom-blue': '#002A5C',
        'custom-white': '#dee2e2', 
        'custom-green': '#90de3d',
        'custom-light-blue':'005084',
        'custom-grey':'#C6CFD4'
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