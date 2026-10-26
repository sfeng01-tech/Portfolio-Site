try {
  const theme = localStorage.getItem('portfolio-theme');
  if (theme === 'dark') {
    document.documentElement.dataset.theme = 'dark';
    document.querySelector('meta[name="theme-color"]').setAttribute('content', '#1b1e19');
  }
} catch {}
