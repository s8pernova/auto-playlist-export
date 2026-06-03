/* Fill the active sheet with videos + live vs VOD views. */

const MAX_RESULTS = 50; // Total latest videos to inspect
const CHANNEL_ID = "UCl92ObB0zFur9AcB5jeMUVA"; // @FCPSeduFCPS
const FIRST_DATA_ROW = 2; // Header is row 1
const PLAYLIST_ID = "PLSz76NCRDYQF3hPS2qS2SGEcoO4__Yd7Z"; // School board meeting playlist
const DEBUG_VIDEO_ID = "RnuZOgyrOmk";
const DEBUG_START_DATE = "2006-01-01";

const COLS = [
  "Video ID",
  "Title",
  "Published Date",
  "Channel 99 Views",
  "Live Views",
  "VOD Views",
  "Total Views",
];

let views;

function dumpPlaylistToSheet() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const sheet = SpreadsheetApp.getActiveSheet();

    setupHeaders_(sheet);

    const tz = Session.getScriptTimeZone();
    const today = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
    const existingIds = getExistingVideoIds_(sheet);

    const playlistItems = getLatestPlaylistItems_(PLAYLIST_ID, MAX_RESULTS);

    const ids = playlistItems
      .map((item) => item.contentDetails && item.contentDetails.videoId)
      .filter(Boolean)
      .filter((id) => !existingIds.has(id));

    if (ids.length === 0) {
      Logger.log("No new videos found in the latest " + MAX_RESULTS + " videos.");
      return;
    }

    const vResp = YouTube.Videos.list("snippet,status", {
      id: ids.join(","),
    });

    const metaById = {};

    (vResp.items || []).forEach((video) => {
      if (video.status && video.status.privacyStatus !== "public") return;

      const iso = video.snippet && video.snippet.publishedAt;
      const publishedAt = iso ? new Date(iso) : null;
      if (!publishedAt) return;

      metaById[video.id] = {
        title: video.snippet.title || "",
        publishedAt,
      };
    });

    const rowsToWrite = [];

    for (const id of ids) {
      const meta = metaById[id];
      if (!meta) continue;

      const startDate = Utilities.formatDate(
        meta.publishedAt,
        tz,
        "yyyy-MM-dd",
      );

      // This requires the account running the script to have YouTube Analytics access.
      // const views = getLiveAndVodViews_(id, startDate, today);

      rowsToWrite.push([
        `=HYPERLINK("https://www.youtube.com/watch?v=${id}","${id}")`,
        meta.title,
        meta.publishedAt,
        0,
        views?.liveViews ?? 0,
        views?.vodViews ?? 0,
        "",
      ]);

      existingIds.add(id);
      Logger.log("Added video ID " + id);
    }

    if (rowsToWrite.length > 0) {
      sheet.insertRowsAfter(1, rowsToWrite.length);

      sheet
        .getRange(2, 1, rowsToWrite.length, COLS.length)
        .setValues(rowsToWrite);

      const totalViewFormulas = rowsToWrite.map((_, index) => {
        const rowNumber = index + 2;
        return [`=SUM(D${rowNumber}:F${rowNumber})`];
      });

      sheet
        .getRange(2, 7, totalViewFormulas.length, 1)
        .setFormulas(totalViewFormulas);
    }

    const lastRow = sheet.getLastRow();

    if (lastRow >= FIRST_DATA_ROW) {
      sheet
        .getRange(FIRST_DATA_ROW, 3, lastRow - FIRST_DATA_ROW + 1, 1)
        .setNumberFormat("M/d/yyyy");
    }
  } finally {
    lock.releaseLock();
  }
}

function getLatestPlaylistItems_(playlistId, totalLimit) {
  const safeLimit = Math.max(1, Math.min(totalLimit, 50));

  const response = YouTube.PlaylistItems.list("snippet,contentDetails", {
    playlistId,
    maxResults: safeLimit,
  });

  return response.items || [];
}

function setupHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLS);
    return;
  }

  sheet.getRange(1, 1, 1, COLS.length).setValues([COLS]);
}

function getExistingVideoIds_(sheet) {
  const lastRow = sheet.getLastRow();

  if (lastRow < FIRST_DATA_ROW) {
    return new Set();
  }

  const values = sheet
    .getRange(FIRST_DATA_ROW, 1, lastRow - FIRST_DATA_ROW + 1, 1)
    .getDisplayValues()
    .flat()
    .map((value) => value.trim())
    .filter(Boolean);

  return new Set(values);
}

function getLiveAndVodViews_(videoId, startDate, endDate) {
  let liveViews = 0;
  let vodViews = 0;

  try {
    const report = YouTubeAnalytics.Reports.query({
      ids: "channel==" + CHANNEL_ID,
      startDate,
      endDate,
      metrics: "views",
      dimensions: "liveOrOnDemand",
      filters: "video==" + videoId,
    });

    (report.rows || []).forEach((row) => {
      const type = row[0];
      const views = Number(row[1]) || 0;

      if (type === "LIVE") {
        liveViews = views;
      } else if (type === "ON_DEMAND") {
        vodViews = views;
      }
    });
  } catch (e) {
    Logger.log("Analytics failed for video " + videoId + ": " + e);
  }

  return { liveViews, vodViews };
}

function debugOneVideo() {
  const tz = Session.getScriptTimeZone();
  const today = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");

  const report = YouTubeAnalytics.Reports.query({
    ids: "channel==" + CHANNEL_ID,
    startDate: DEBUG_START_DATE,
    endDate: today,
    metrics: "views",
    dimensions: "liveOrOnDemand",
    filters: "video==" + DEBUG_VIDEO_ID,
  });

  Logger.log(JSON.stringify(report, null, 2));
}

function debugChannels() {
  const resp = YouTube.Channels.list("snippet", { mine: true });
  Logger.log(JSON.stringify(resp, null, 2));
}
