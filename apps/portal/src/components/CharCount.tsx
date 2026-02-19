"use client";

/**
 * CharCount — displays "{used} / {limit}" with color coding.
 *   green  : ≤ 80% of limit
 *   yellow : 81–100%
 *   red    : > 100% (over limit)
 */
export default function CharCount({
  text,
  limit,
}: {
  text: string;
  limit: number;
}) {
  const used = text.length;
  const ratio = used / limit;

  const color =
    ratio > 1
      ? "text-red-600 font-semibold"
      : ratio > 0.8
      ? "text-yellow-600"
      : "text-green-600";

  return (
    <span className={`text-xs tabular-nums ${color}`}>
      {used} / {limit}
    </span>
  );
}
