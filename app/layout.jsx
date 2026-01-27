import './globals.css';

export const metadata = {
  title: 'Hello GIF',
  description: 'A simple Next.js hello world with a GIF.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
