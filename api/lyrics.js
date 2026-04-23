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
}

export default async function handler(req, res) {
  try {
    // ←ここを完全に置き換え
    const { title, name, artist, singer } = req.query;
    // 👇ここ超重要
    const finalTitle = title || name || "";
    const finalArtist = artist || singer || "";
    
    if (!finalTitle) {
      return res.status(400).json({ error: "Missing title" });
}

    console.log("TITLE:", finalTitle);
    console.log("ARTIST:", finalArtist);
    console.log("RAW:", req.query);

    console.log("START FETCH");
    const query = `${finalTitle} ${finalArtist}`;

    let lyrics = null;

    // ========= ① LRCLIB（第一候補） =========
    if (!lyrics) {
      try {
        console.log("QUERY:", query);
        
        let r = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(title)}`);
        let data = await r.json();

        console.log("LRCLIB RESULT:", data?.length);
        
        if (Array.isArray(data) && data.length > 0) {
          lyrics = data[0].syncedLyrics || data[0].plainLyrics;
        }

        console.log("LYRICS FOUND?", !!lyrics);
        
      } catch (e) {
        console.log("LRCLIB fallback error:", e);
      }
    }

    // ========= ② Netease fallback =========
    if (!lyrics) {
      try {
        let r = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`);
        let r1 = await fetch(`https://music.xianqiao.wang/neteaseapiv2/search?keywords=${encodeURIComponent(query)}`);
        let j1 = await r1.json();

        let songs = j1?.result?.songs;

        if ((!songs || songs.length === 0) && finalTitle) {
          // タイトルだけでもう一回
          r1 = await fetch(`https://music.xianqiao.wang/neteaseapiv2/search?keywords=${encodeURIComponent(finalTitle)}`);
          j1 = await r1.json();
          songs = j1?.result?.songs;
        }

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

    // ========= 見つからなかった =========
    if (!lyrics) {
      return res.status(404).json({ error: "Lyrics not found" });
    }

    // ========= パース =========
    const parsed = parseLRC(lyrics);

    let lrc = lyrics;

    if (parsed.length > 0) {
      lrc = toLRC(parsed);
    }

    // ========= レスポンス =========
    console.log("FINAL LYRICS:", lrc?.slice(0, 50));
    
    return res.json({
      lyrics: lrc,              // ← アプリはこれ使う（重要）
      plain: stripLRC(lrc),    // ← 普通の歌詞
      lines: parsed            // ← タイム付き配列
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server crashed" });
  }
}
