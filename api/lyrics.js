function toLRC(lines) {
  return lines.map(line => {
    const min = Math.floor(line.time / 60);
    const sec = (line.time % 60).toFixed(2).padStart(5, "0");
    return `[${String(min).padStart(2, "0")}:${sec}]${line.text}`;
  }).join("\n");
}
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
 
const cleanTitle = title.split(" - ")[0].trim();
const cleanArtist = artist.split(",")[0].trim();

const baseQuery = `${cleanTitle} ${cleanArtist}`;
const queryList = [
  baseQuery,
  `${cleanTitle} 歌詞`,
  cleanTitle
];

    let lyrics = null;

    // LRCLIB
for (const q of queryList) {
  try {
    const r = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`);
    const data = await r.json();

    if (Array.isArray(data) && data.length > 0) {
      lyrics = data[0].syncedLyrics || data[0].plainLyrics;
      if (lyrics) break;
    }
  } catch (e) {
    console.log("LRCLIB error:", e);
  }
}

    // fallback
if (!lyrics) {
  for (const q of queryList) {
    try {
      const r1 = await fetch(`https://music.xianqiao.wang/neteaseapiv2/search?keywords=${encodeURIComponent(q)}`);
      const j1 = await r1.json();

      const songs = j1?.result?.songs;
      if (songs && songs.length > 0) {
        const id = songs[0].id;

        const r2 = await fetch(`https://music.xianqiao.wang/neteaseapiv2/lyric?id=${id}`);
        const j2 = await r2.json();

        lyrics = j2?.lrc?.lyric;
        if (lyrics) break;
      }
    } catch (e) {
      console.log("Netease error:", e);
    }
  }
}

    if (!lyrics) {
      return res.status(404).json({ error: "Lyrics not found" });
    }

const parsed = parseLRC(lyrics);
const lrc = toLRC(parsed);

return res.json({
  lyrics: lrc
});

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server crashed" });
  }
}
