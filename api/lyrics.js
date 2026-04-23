```js
export default async function handler(req, res) {
  try {
    const { title, artist } = req.query;

    if (!title || !artist) {
      return res.status(400).json({ error: "Missing params" });
    }

    const query = `${title} ${artist}`;

    // ---- LRCLIB ----
    let lyrics = null;

    try {
      const r = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`);
      const data = await r.json();

      if (Array.isArray(data) && data.length > 0) {
        lyrics = data[0].syncedLyrics || data[0].plainLyrics;
      }
    } catch (e) {
      console.log("LRCLIB error:", e);
    }

    // ---- Netease fallback ----
    if (!lyrics) {
      try {
        const r1 = await fetch(`https://music.xianqiao.wang/neteaseapiv2/search?keywords=${encodeURIComponent(query)}`);
        const j1 = await r1.json();

        const songs = j1?.result?.songs;
        if (songs && songs.length > 0) {
          const id = songs[0].id;

          const r2 = await fetch(`https://music.xianqiao.wang/neteaseapiv2/lyric?id=${id}`);
          const j2 = await r2.json();

          lyrics = j2?.lrc?.lyric;
        }
      } catch (e) {
        console.log("Netease error:", e);
      }
    }

    if (!lyrics) {
      return res.status(404).json({ error: "Lyrics not found" });
    }

    return res.json({ lyrics });

  } catch (err) {
    console.error("FATAL:", err);
    return res.status(500).json({ error: "Server crashed" });
  }
}
```
