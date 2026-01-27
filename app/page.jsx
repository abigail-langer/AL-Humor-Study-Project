import Script from 'next/script';

export default function Home() {
  return (
    <main className="page">
      <div className="card">
        <div
          className="tenor-gif-embed"
          data-postid="10874319"
          data-share-method="host"
          data-aspect-ratio="1.77778"
          data-width="100%"
        >
          <a href="https://tenor.com/view/minions-hello-screen-kiss-gif-10874319">
            Minions Hello GIF
          </a>
          from <a href="https://tenor.com/search/minions-gifs">Minions GIFs</a>
        </div>

        <Script src="https://tenor.com/embed.js" strategy="afterInteractive" />
        <p className="caption">Hello, Next.js 👋</p>
      </div>
    </main>
  );
}
