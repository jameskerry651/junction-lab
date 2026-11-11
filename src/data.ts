import posts from "./generated/posts.json" with { type: "json" };

export const records = posts.records;
export type ArchiveRecord = (typeof records)[number];
export const archiveColumns = posts.archiveColumns;
export const categories = ["全部文章", ...archiveColumns];
export function columnFiles(lane: number) {
  return records.flatMap((record, index) =>
    record.category === archiveColumns[lane] ? [index] : [],
  );
}
export function fileLocation(index: number) {
  const lane = archiveColumns.indexOf(records[index].category);
  return { lane, row: 12 + columnFiles(lane).indexOf(index), slot: index };
}
// A stable record index; physical cells are handled independently by archive-loop.
export function fileAtSlot(slot: number) {
  return slot;
}
export const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
