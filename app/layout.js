import './globals.css';

export const metadata = {
  title: 'Angel / Devil Idea Judge',
  description: 'Toss a startup idea into a playful angel/devil tribunal.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
