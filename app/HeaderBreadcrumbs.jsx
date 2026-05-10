'use client';

import { usePathname } from 'next/navigation';

function labelForSegment(segment) {
  return segment
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .slice(0, 56);
}

export default function HeaderBreadcrumbs() {
  const pathname = usePathname();
  const parts = pathname.split('/').filter(Boolean);

  if (!parts.length) {
    return <span className="site-crumb-current">Judge</span>;
  }

  return (
    <nav className="site-breadcrumbs" aria-label="Breadcrumb">
      <a href="/">Home</a>
      {parts.map((part, index) => {
        const href = `/${parts.slice(0, index + 1).join('/')}`;
        const isLast = index === parts.length - 1;

        return (
          <span className="site-crumb" key={href}>
            <span aria-hidden="true">/</span>
            {isLast ? (
              <span className="site-crumb-current">{labelForSegment(part)}</span>
            ) : (
              <a href={href}>{labelForSegment(part)}</a>
            )}
          </span>
        );
      })}
    </nav>
  );
}
