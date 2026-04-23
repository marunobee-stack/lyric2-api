res.setHeader("Content-Type", "application/json");
res.setHeader("Content-Disposition", "attachment; filename=lyrics.json");
return res.json({
  raw: lyrics,
  plain: stripLRC(lyrics),
  lines: parsed
});
function stripLRC(lrc) {
  return lrc.replace(/\[\d{2}:\d{2}\.\d{2}\]/g, '');
}

function parseLRC(lrc) {
  return lrc.split('\n').map(line => {
    const match = line.match(/\[(\d+):(\d+\.\d+)\](.*)/);
    if (!match) return null;

    return {
      time: parseInt(match[1]) * 60 + parseFloat(match[2]),
      text: match[3].trim()
    };
  }).filter(Boolean);
}export default async function handler(req, res) {
  try {
    const { title, artist } = req.query;

    if (!title || !artist) {
      return res.status(400).json({ error: "Missing params" });
    }

    const query = `${title} ${artist}`;

    let lyrics = null;

    // LRCLIB
    try {
      const r = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`);
      const data = await r.json();

      if (Array.isArray(data) && data.length > 0) {
        lyrics = data[0].syncedLyrics || data[0].plainLyrics;
      }
    } catch (e) {
      console.log("LRCLIB error:", e);
    }

    // fallback
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

    const parsed = parseLRC(lyrics);

return res.json({
  raw: lyrics,
  plain: stripLRC(lyrics),
  lines: parsed
});

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server crashed" });
  }
}
