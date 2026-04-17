/* Fill the active sheet with videos + live vs VOD views. */

const MAX_RESULTS = 25;
const CHANNEL_ID = "UCl92ObB0zFur9AcB5jeMUVA";

function dumpPlaylistToSheet() {
	const playlistId = "PLSz76NCRDYQF3hPS2qS2SGEcoO4__Yd7Z"; // school board playlist
	const sheet = SpreadsheetApp.getActiveSheet();

	let pageToken = null;
	const tz = Session.getScriptTimeZone();
	const today = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");

	do {
		const pl = YouTube.PlaylistItems.list("snippet,contentDetails", {
			playlistId,
			maxResults: MAX_RESULTS,
			pageToken,
		});

		const items = pl.items || [];
		if (items.length === 0) break;

		const ids = items
			.map((it) => it.contentDetails?.videoId)
			.filter(Boolean);
		if (!ids.length) {
			pageToken = pl.nextPageToken;
			continue;
		}

		// Get video metadata (title, publish date, privacy)
		const vResp = YouTube.Videos.list("snippet,status", {
			id: ids.join(","),
		});

		const metaById = {};
		(vResp.items || []).forEach((v) => {
			// skip private / unlisted
			if (v.status && v.status.privacyStatus !== "public") return;

			const iso = v.snippet?.publishedAt || "";
			const dateObj = iso ? new Date(iso) : null;

			metaById[v.id] = {
				title: v.snippet?.title || "",
				publishedAt: dateObj,
			};
		});

		const startRow = sheet.getLastRow() + 1;
		let row = startRow;

		// For each video on this page, pull analytics (live vs on-demand)
		ids.forEach((id) => {
			const meta = metaById[id];
			if (!meta) return; // skipped (private, etc.)

			// Skip if video id is already in sheet
			if (
				sheet
					.getRange(row, 1)
					.createTextFinder(id)
					.matchEntireCell(true)
					.findNext()
			)
				return;

			// Build Analytics query dates
			const startDate = Utilities.formatDate(
				meta.publishedAt,
				tz,
				"yyyy-MM-dd",
			);

			let liveViews = 0;
			let vodViews = 0;

			try {
				// One Analytics call per video: split views by liveOrOnDemand
				const report = YouTubeAnalytics.Reports.query({
					ids: "channel==" + CHANNEL_ID,
					startDate: startDate,
					endDate: today,
					metrics: "views",
					dimensions: "liveOrOnDemand",
					filters: "video==" + id,
				});

				if (report && report.rows) {
					report.rows.forEach((r) => {
						const type = r[0]; // 'LIVE' or 'ON_DEMAND'
						const views = Number(r[1]) || 0;
						if (type === "LIVE") {
							liveViews = views;
						} else if (type === "ON_DEMAND") {
							vodViews = views;
						}
					});
				}
			} catch (e) {
				Logger.log("Analytics failed for video " + id + ": " + e);
			}

			// Column A: clickable ID
			sheet
				.getRange(row, 1)
				.setFormula(
					`=HYPERLINK("https://www.youtube.com/watch?v=${id}","${id}")`,
				);

			// Columns B-C: title, date, Ch 99 (blank), live, VOD
			sheet
				.getRange(row, 2, 1, 5)
				.setValues([
					[
						meta.title,
						meta.publishedAt || "",
						0,
						liveViews,
						vodViews,
					],
				]);

			row++;
		});

		pageToken = pl.nextPageToken;
	} while (pageToken);

	// Format date column C as M/d/yyyy
	const lastRow = sheet.getLastRow();
	if (lastRow >= 2) {
		sheet.getRange(2, 3, lastRow - 1, 1).setNumberFormat("M/d/yyyy");
	}
}

function debugOneVideo() {
	const tz = Session.getScriptTimeZone();
	const today = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");

	const videoId = "RnuZOgyrOmk";
	const startDate = "2006-01-01"; // wide range for testing

	const report = YouTubeAnalytics.Reports.query({
		ids: "channel==" + CHANNEL_ID,
		startDate: startDate,
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
