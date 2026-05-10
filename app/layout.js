import './globals.css';
import SiteHeader from './SiteHeader.jsx';

export const metadata = {
  title: 'Angel / Devil Idea Judge',
  description: 'Toss a startup idea into a playful angel/devil tribunal.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
