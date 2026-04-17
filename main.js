/* Fill the active sheet with videos + live vs VOD views. */

const MAX_RESULTS = 25; // Read the latest X videos from the playlist
const CHANNEL_ID = "UCl92ObB0zFur9AcB5jeMUVA"; // @FCPSeduFCPS
const PLAYLIST_ID = "PLSz76NCRDYQF3hPS2qS2SGEcoO4__Yd7Z";  // School Board Meetings
const FIRST_DATA_ROW = 2; // Header is row 1
const COLS = [
	"Video ID",
	"Title",
	"Published Date",
	"Channel 99 Views",
	"Live Views",
	"VOD Views",
];

function dumpPlaylistToSheet() {
	const sheet = SpreadsheetApp.getActiveSheet();

	setupHeaders_(sheet);

	const tz = Session.getScriptTimeZone();
	const today = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");

	const existingIds = getExistingVideoIds_(sheet);

	let pageToken = null;
	let rowsToWrite = [];
	let views;

	do {
		const pl = YouTube.PlaylistItems.list("snippet,contentDetails", {
			playlistId: PLAYLIST_ID,
			maxResults: MAX_RESULTS,
			pageToken,
		});

		const items = pl.items || [];
		if (items.length === 0) break;

		const ids = items
			.map((it) => it.contentDetails?.videoId)
			.filter(Boolean)
			.filter((id) => !existingIds.has(id));

		if (!ids.length) {
			pageToken = pl.nextPageToken;
			continue;
		}

		const vResp = YouTube.Videos.list("snippet,status", {
			id: ids.join(","),
		});

		const metaById = {};

		(vResp.items || []).forEach((v) => {
			if (v.status?.privacyStatus !== "public") return;

			const iso = v.snippet?.publishedAt || "";
			const publishedAt = iso ? new Date(iso) : null;
			if (!publishedAt) return;

			metaById[v.id] = {
				title: v.snippet?.title || "",
				publishedAt,
			};
		});

		for (const id of ids) {
			const meta = metaById[id];
			if (!meta) continue;

			const startDate = Utilities.formatDate(
				meta.publishedAt,
				tz,
				"yyyy-MM-dd",
			);

			// Can only run successfully through the owner of the brand account
			// const views = getLiveAndVodViews_(id, startDate, today);

			rowsToWrite.push([
				`=HYPERLINK("https://www.youtube.com/watch?v=${id}","${id}")`,
				meta.title,
				meta.publishedAt,
				0, // Can't get CH99 views; default to 0
				views?.liveViews ?? 0,
				views?.vodViews ?? 0,
			]);

			existingIds.add(id);

			Logger.log("Added video ID " + id);
		}

		pageToken = pl.nextPageToken;
	} while (pageToken);

	if (rowsToWrite.length > 0) {
		sheet.insertRowsAfter(1, rowsToWrite.length); // Append right after the headers

		sheet
			.getRange(2, 1, rowsToWrite.length, rowsToWrite[0].length)
			.setValues(rowsToWrite);

		const totalViewFormulas = rowsToWrite.map((_, index) => {
			const rowNumber = index + 2;
			return [`=SUM(D${rowNumber}:F${rowNumber})`]; // Col D through F
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
}

function setupHeaders_(sheet) {
	if (sheet.getLastRow() === 0) {
		sheet.appendRow(COLS);
		return;
	}

	const firstCell = sheet.getRange(1, 1).getDisplayValue();
	if (!firstCell) {
		sheet.getRange(1, 1, 1, 6).setValues([COLS]);
	}
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

	const videoId = "RnuZOgyrOmk";
	const startDate = "2006-01-01";

	const report = YouTubeAnalytics.Reports.query({
		ids: "channel==" + CHANNEL_ID,
		startDate,
		endDate: today,
		metrics: "views",
		dimensions: "liveOrOnDemand",
		filters: "video==" + videoId,
	});

	Logger.log(JSON.stringify(report, null, 2));
}

function debugChannels() {
	const resp = YouTube.Channels.list("snippet", { mine: true });
	Logger.log(JSON.stringify(resp, null, 2));
}
