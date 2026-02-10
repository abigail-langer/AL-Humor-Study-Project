"use client";

import { useRouter, useSearchParams } from "next/navigation";

export default function CaptionSort({ value }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleChange = (event) => {
    const nextValue = event.target.value;
    const params = new URLSearchParams(searchParams.toString());

    if (nextValue === "recent") {
      params.delete("sort");
    } else {
      params.set("sort", nextValue);
    }

    params.set("page", "1");
    const queryString = params.toString();
    router.push(queryString ? `/?${queryString}` : "/");
  };

  return (
    <label className="sort-control">
      <span className="sort-label">SORT:</span>
      <select className="sort-select" value={value} onChange={handleChange}>
        <option value="recent">Most Recent</option>
        <option value="likes_desc">Most Likes</option>
        <option value="likes_asc">Least Likes</option>
      </select>
    </label>
  );
}
