export const boardPageSize = 50;

export function hasMoreBoardIdeas(loadedCount, pageSize = boardPageSize) {
  return loadedCount === pageSize;
}

export function createBoardAutoLoadObserver({
  sentinel,
  onLoad,
  observerFactory = globalThis.IntersectionObserver
}) {
  if (!sentinel || typeof onLoad !== 'function' || typeof observerFactory !== 'function') {
    return null;
  }

  const observer = new observerFactory((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      onLoad();
    }
  }, {
    root: null,
    rootMargin: '640px 0px',
    threshold: 0
  });

  observer.observe(sentinel);
  return observer;
}
