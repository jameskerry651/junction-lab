export type Scope = "selection" | "chapter" | "document";
export type Context = {
  body: string;
  start: number;
  end: number;
  text: string;
};
export type Edit = { original: string; replacement: string; reason: string };
export function contextRange(
  body: string,
  scope: Scope,
  start = 0,
  end = start,
): Context {
  if (scope === "document")
    return { body, start: 0, end: body.length, text: body };
  if (start < 0 || end < start || end > body.length)
    throw Error("选区已变化，请重新选择正文");
  if (scope === "selection") {
    if (start === end)
      throw Error("请先在正文中选中要处理的文字，或切换为当前章节 / 全文");
    return { body, start, end, text: body.slice(start, end) };
  }
  const headings: { start: number; level: number }[] = [];
  let position = 0,
    fence = "",
    fenceLength = 0;
  for (const line of body.split(/(?<=\n)/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) {
        fence = marker[0];
        fenceLength = marker.length;
      } else if (
        marker[0] === fence &&
        marker.length >= fenceLength &&
        /^ {0,3}(?:`+|~+)\s*$/.test(line)
      )
        fence = "";
    } else if (!fence) {
      const heading = /^ {0,3}(#{1,6})\s/.exec(line);
      if (heading) headings.push({ start: position, level: heading[1].length });
    }
    position += line.length;
  }
  const active = headings.filter((heading) => heading.start <= start).at(-1);
  const from = active?.start ?? 0;
  const to =
    headings.find(
      (heading) =>
        heading.start > start && (!active || heading.level <= active.level),
    )?.start ?? body.length;
  return { body, start: from, end: to, text: body.slice(from, to) };
}
export function applyEdits(
  context: Context,
  edits: Edit[],
  accepted: Set<number>,
): string {
  const ranges = edits
    .map((edit, index) => {
      const start = context.text.indexOf(edit.original);
      if (
        start < 0 ||
        (!edit.original && context.text) ||
        (edit.original && context.text.indexOf(edit.original, start + 1) >= 0)
      )
        throw Error("修改无法唯一匹配原文，请重新生成");
      return {
        start: context.start + start,
        end: context.start + start + edit.original.length,
        edit,
        index,
      };
    })
    .sort((a, b) => a.start - b.start);
  for (let i = 1; i < ranges.length; i++)
    if (
      ranges[i].start < ranges[i - 1].end ||
      ranges[i].start === ranges[i - 1].start
    )
      throw Error("修改范围重叠，请重新生成");
  let next = context.body;
  for (const range of ranges.reverse())
    if (accepted.has(range.index))
      next =
        next.slice(0, range.start) +
        range.edit.replacement +
        next.slice(range.end);
  return next;
}
