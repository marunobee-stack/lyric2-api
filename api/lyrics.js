// ========= Musixmatch =========
let cachedToken = null;
let tokenTime = 0;

async function getMxmToken() {
  if (cachedToken && Date.now() - tokenTime < 10 * 60 * 1000) {
    return cachedToken;
  }

  const r = await fetch(
    "https://apic-desktop.musixmatch.com/ws/1.1/token.get?app_id=web-desktop-app-v1.0"
  );
  const j = await r.json();

  cachedToken = j?.message?.body?.user_token;
  tokenTime = Date.now();

  return cachedToken;
}

async function fetchMusixmatch(title, artist) {
  try {
    const token = await getMxmToken();

    const headers = {
      "User-Agent": "Mozilla/5.0",
      "Accept": "application/json",
      "Referer": "https://www.musixmatch.com/",
      "Origin": "https://www.musixmatch.com"
    };

    const base = "https://apic-desktop.musixmatch.com/ws/1.1";

    // ===== 検索 =====
    const searchUrl =
      `${base}/track.search?` +
      `q_track=${encodeURIComponent(title)}` +
      `&q_artist=${encodeURIComponent(artist)}` +
      `&page_size=3` +
      `&page=1` +
      `&s_track_rating=desc` +
      `&app_id=web-desktop-app-v1.0` +
      `&usertoken=${token}`;

    const r = await fetch(searchUrl, { headers });
    const j = await r.json();

    const tracks = j?.message?.body?.track_list;
    if (!tracks || tracks.length === 0) return null;

    const track = tracks[0].track;

    // ===== 歌詞取得 =====
    const lyricUrl =
      `${base}/track.subtitle.get?` +
      `track_id=${track.track_id}` +
      `&subtitle_format=lrc` +
      `&app_id=web-desktop-app-v1.0` +
      `&usertoken=${token}`;

    const r2 = await fetch(lyricUrl, { headers });
    const j2 = await r2.json();

    let subtitle = j2?.message?.body?.subtitle?.subtitle_body;

    // LRCじゃないやつ弾く
    if (subtitle && !subtitle.includes("[")) {
      subtitle = null;
    }

    return subtitle || null;

  } catch (e) {
    console.log("Musixmatch error:", e);
    return null;
  }
}
function toLRC(lines) {
  return lines.map(line => {
    const min = Math.floor(line.time / 60);
    const sec = (line.time % 60).toFixed(2).padStart(5, "0");
    return `[${String(min).padStart(2, "0")}:${sec}]${line.text}`;
  }).join("\n"); // ←ここが超重要
}

function stripLRC(lrc) {
  return lrc.replace(/\[\d+:\d+\.\d+\]/g, '');
}

function parseLRC(lrc) {
  return lrc
    .replace(/\]\s*\[/g, "]\n[") // ←ここ追加
    .split('\n')
    .map(line => {
      const match = line.match(/\[(\d+):(\d+\.\d+)\](.*)/);
      if (!match) return null;

      return {
        time: parseInt(match[1]) * 60 + parseFloat(match[2]),
        text: match[3].trim()
      };
    })
    .filter(Boolean);
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

    // ========= ① Musixmatch（最優先） =========
if (!lyrics) {
  lyrics = await fetchMusixmatch(finalTitle, finalArtist);
  console.log("MUSIXMATCH:", !!lyrics);
}

    // ========= ① LRCLIB（第一候補） =========
    if (!lyrics) {
      try {
        console.log("QUERY:", query);
        
        let r = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`);
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

    lyrics = lyrics.replace(/\]\s*\[/g, "]\n[");

    // ========= パース =========
    const parsed = parseLRC(lyrics);

    console.log("PARSED:", parsed.length);
    console.log("PARSED SAMPLE:", parsed[0]);
    let lrc = lyrics;

    if (parsed.length > 0) {
      lrc = toLRC(parsed);
    }

    // ========= レスポンス =========
    console.log("FINAL LYRICS:", lrc?.slice(0, 50));
    
    return res.send(lrc);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server crashed" });
  }
}
