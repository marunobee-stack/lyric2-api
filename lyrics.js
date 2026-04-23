```js
export default async function handler(req, res) {
  const { title, artist, isrc, durationMs } = req.query;

  if (!title || !artist) {
    return res.status(400).json({ error: "Missing title or artist" });
  }

  // ------------------------
  // 正規化
  // ------------------------
  function normalize(s) {
    return s
      .replace(/[\(\[].*?[\)\]]/g, "")
      .replace(/(feat\.?|ft\.?).*/i, "")
      .replace(/(remix|mix|edit|ver|version|live).*/i, "")
      .replace(/\u3000/g, " ")
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .toLowerCase()
      .trim();
  }

  function similarity(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;

    const as = new Set(a.split(" "));
    const bs = new Set(b.split(" "));
    const inter = [...as].filter(x => bs.has(x)).length;

    return inter / Math.max(as.size, bs.size);
  }

  function durationScore(aMs, bMs) {
    if (!aMs || !bMs) return 0;
    const diff = Math.abs(aMs - bMs) / 1000;

    if (diff <= 3) return 1;
    if (diff <= 8) return 0.6;
    if (diff <= 15) return 0.3;
    return 0;
  }

  function pickBestLyric(candidates, spotifyMeta) {
    const nTitle = normalize(spotifyMeta.title);
    const nArtist = normalize(spotifyMeta.artist);

    let best = null;
    let bestScore = -1;

    for (const c of candidates) {
      const ct = normalize(c.title || "");
      const ca = normalize(c.artist || "");

      const isrcMatch =
        c.isrc && spotifyMeta.isrc && c.isrc === spotifyMeta.isrc;

      const tScore = similarity(ct, nTitle);
      const aScore = similarity(ca, nArtist);
      const dScore = durationScore(c.durationMs, spotifyMeta.durationMs);
      const hasSynced = !!c.syncedLyrics;

      const score =
        (isrcMatch ? 1000 : 0) +
        tScore * 3 +
        aScore * 2 +
        dScore * 2 +
        (hasSynced ? 5 : 0);

      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }

    return best;
  }

  // ------------------------
  // LRCLIB
  // ------------------------
  async function fetchLRCLIB(query) {
    try {
      const r = await fetch(
        `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`
      );
      const data = await r.json();

      if (!Array.isArray(data)) return [];

      return data.map(d => ({
        title: d.trackName,
        artist: d.artistName,
        durationMs: d.duration ? d.duration * 1000 : null,
        isrc: d.isrc || null,
        syncedLyrics: d.syncedLyrics || null,
        plainLyrics: d.plainLyrics || null
      }));
    } catch (e) {
      return [];
    }
  }

  // ------------------------
  // Netease
  // ------------------------
  async function fetchNetease(query) {
    try {
      const r1 = await fetch(
        `https://music.xianqiao.wang/neteaseapiv2/search?keywords=${encodeURIComponent(query)}`
      );
      const j1 = await r1.json();

      const songs = j1?.result?.songs || [];
      const results = [];

      for (const s of songs.slice(0, 5)) {
        const r2 = await fetch(
          `https://music.xianqiao.wang/neteaseapiv2/lyric?id=${s.id}`
        );
        const j2 = await r2.json();

        results.push({
          title: s.name,
          artist: s.artists?.map(a => a.name).join(" "),
          durationMs: s.duration || null,
          isrc: null,
          syncedLyrics: j2?.lrc?.lyric || null,
          plainLyrics: null
        });
      }

      return results;
    } catch (e) {
      return [];
    }
  }

  // ------------------------
  // 実行
  // ------------------------
  const spotifyMeta = {
    title,
    artist,
    isrc: isrc || null,
    durationMs: durationMs ? Number(durationMs) : null
  };

  const query = `${normalize(title)} ${normalize(artist)}`;

  const [lrclibResults, neteaseResults] = await Promise.all([
    fetchLRCLIB(query),
    fetchNetease(query)
  ]);

  const candidates = [...lrclibResults, ...neteaseResults];

  if (candidates.length === 0) {
    return res.status(404).json({ error: "No candidates" });
  }

  const best = pickBestLyric(candidates, spotifyMeta);

  if (!best) {
    return res.status(404).json({ error: "No match" });
  }

  return res.json({
    match: {
      title: best.title,
      artist: best.artist,
      isrc: best.isrc || null
    },
    hasSynced: !!best.syncedLyrics,
    lyrics: best.syncedLyrics || best.plainLyrics
  });
}
```

